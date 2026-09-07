'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { ReportBlock, ReportTemplate } from '@/lib/types/database'

// Admin-only management of the per-service report designer. A row with
// service_type_id = null is the company-wide DEFAULT every service type inherits
// until it is given its own row. Writes are also admin/office at the RLS layer,
// but the designer is an admin surface so we gate to admin here.

const SETTINGS_PATH = '/dashboard/settings'

async function requireAdmin() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Not signed in' as const }
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, role')
    .eq('id', user.id)
    .single()
  if (!profile || (profile as { role?: string }).role !== 'admin') {
    return { error: 'Only admins can design reports.' as const }
  }
  return { supabase, userId: user.id }
}

export interface SaveReportTemplateInput {
  // null = the company-wide default template.
  serviceTypeId: string | null
  name: string
  companyName: string | null
  logoUrl: string | null
  headerColor: string | null
  footerText: string | null
  includeSignature: boolean
  sections: Record<string, unknown>
  layout: ReportBlock[] | null
}

function rowFromInput(input: SaveReportTemplateInput) {
  return {
    service_type_id: input.serviceTypeId,
    name: input.name?.trim() || 'Report template',
    company_name: input.companyName?.trim() || null,
    logo_url: input.logoUrl?.trim() || null,
    header_color: input.headerColor?.trim() || null,
    footer_text: input.footerText?.trim() || null,
    include_signature: input.includeSignature,
    sections: input.sections ?? {},
    layout: input.layout,
    updated_at: new Date().toISOString(),
  }
}

/**
 * Create or update a report template. Service-specific rows upsert on the unique
 * service_type_id; the single default row (null service type) is found-then
 * update/insert because SQL treats NULLs as distinct under a normal unique key.
 */
export async function saveReportTemplate(
  input: SaveReportTemplateInput,
): Promise<{ ok: boolean; error?: string }> {
  const auth = await requireAdmin()
  if ('error' in auth) return { ok: false, error: auth.error }
  const { supabase } = auth

  const row = rowFromInput(input)

  if (input.serviceTypeId) {
    const { error } = await supabase
      .from('report_templates')
      .upsert(row, { onConflict: 'service_type_id' })
    if (error) return { ok: false, error: error.message }
  } else {
    const { data: existing } = await supabase
      .from('report_templates')
      .select('id')
      .is('service_type_id', null)
      .maybeSingle()
    if (existing?.id) {
      const { error } = await supabase
        .from('report_templates')
        .update(row)
        .eq('id', existing.id)
      if (error) return { ok: false, error: error.message }
    } else {
      const { error } = await supabase.from('report_templates').insert(row)
      if (error) return { ok: false, error: error.message }
    }
  }

  revalidatePath(SETTINGS_PATH)
  return { ok: true }
}

/**
 * Reset a target to inherit: delete its row entirely. A service type then falls
 * back to the company default; the company default falls back to the built-in
 * layout/branding.
 */
export async function resetReportTemplate(
  serviceTypeId: string | null,
): Promise<{ ok: boolean; error?: string }> {
  const auth = await requireAdmin()
  if ('error' in auth) return { ok: false, error: auth.error }
  const { supabase } = auth

  let query = supabase.from('report_templates').delete()
  query = serviceTypeId
    ? query.eq('service_type_id', serviceTypeId)
    : query.is('service_type_id', null)
  const { error } = await query
  if (error) return { ok: false, error: error.message }

  revalidatePath(SETTINGS_PATH)
  return { ok: true }
}

/** Load all template rows (default + per service type). Admin only. */
export async function getReportTemplates(): Promise<ReportTemplate[]> {
  const auth = await requireAdmin()
  if ('error' in auth) return []
  const { supabase } = auth
  const { data } = await supabase.from('report_templates').select('*')
  return (data ?? []) as ReportTemplate[]
}
