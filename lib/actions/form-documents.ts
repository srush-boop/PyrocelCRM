'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import type { FormDocument, FormDocumentStatus, Profile } from '@/lib/types/database'

// Read/track form submissions (internal-task instances) whose template is
// flagged `route_to_purchasing` and that carry uploaded documents. These live
// under internal-task RLS that only exposes them to the owner/quality manager,
// so the office reads/updates them here via the service-role client, gated by an
// explicit staff check in code.

const LIST_PATH = '/dashboard/invoices/purchase-invoices'

async function requireStaff() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Not signed in' as const }
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, role, full_name')
    .eq('id', user.id)
    .single()
  const p = profile as Pick<Profile, 'id' | 'role' | 'full_name'> | null
  if (!p) return { error: 'No profile' as const }
  if (p.role !== 'admin' && p.role !== 'office') return { error: 'Not authorised' as const }
  return { userId: user.id, profile: p }
}

interface InstanceRow {
  id: string
  template_id: string
  user_id: string | null
  status: string | null
  completed_at: string | null
  created_at: string
  reference_number: string | null
  approval_status: string | null
  purchasing_status: string | null
  purchasing_completed_at: string | null
  purchasing_completed_by: string | null
}

/**
 * Lists every submission of a purchasing-flagged form that has at least one
 * uploaded document, newest first. Returns [] for non-staff.
 */
export async function listFormDocuments(): Promise<FormDocument[]> {
  const auth = await requireStaff()
  if ('error' in auth) return []

  const admin = createAdminClient()

  // 1) Flagged template ids.
  const { data: templates } = await admin
    .from('internal_task_templates')
    .select('id, name, category')
    .eq('route_to_purchasing', true)
  const templateList = (templates ?? []) as { id: string; name: string; category: string | null }[]
  if (templateList.length === 0) return []
  const templateMap = new Map(templateList.map((t) => [t.id, t]))

  // 2) Submissions of those templates.
  const { data: instances } = await admin
    .from('internal_task_instances')
    .select(
      'id, template_id, user_id, status, completed_at, created_at, reference_number, approval_status, purchasing_status, purchasing_completed_at, purchasing_completed_by',
    )
    .in('template_id', templateList.map((t) => t.id))
    .order('created_at', { ascending: false })
    .limit(2000)
  const instanceList = (instances ?? []) as InstanceRow[]
  if (instanceList.length === 0) return []

  // 3) Attachments for those submissions (the actual documents).
  const { data: attachments } = await admin
    .from('internal_task_attachments')
    .select('id, instance_id, name, content_type, size_bytes')
    .in('instance_id', instanceList.map((i) => i.id))
  const filesByInstance = new Map<string, FormDocument['files']>()
  for (const a of (attachments ?? []) as {
    id: string
    instance_id: string
    name: string
    content_type: string | null
    size_bytes: number | null
  }[]) {
    const arr = filesByInstance.get(a.instance_id) ?? []
    arr.push({ id: a.id, name: a.name, content_type: a.content_type, size_bytes: a.size_bytes })
    filesByInstance.set(a.instance_id, arr)
  }

  // 4) Resolve submitter + completed-by names in one query.
  const profileIds = new Set<string>()
  for (const i of instanceList) {
    if (i.user_id) profileIds.add(i.user_id)
    if (i.purchasing_completed_by) profileIds.add(i.purchasing_completed_by)
  }
  const nameById = new Map<string, string | null>()
  if (profileIds.size > 0) {
    const { data: profiles } = await admin
      .from('profiles')
      .select('id, full_name')
      .in('id', [...profileIds])
    for (const p of (profiles ?? []) as { id: string; full_name: string | null }[]) {
      nameById.set(p.id, p.full_name)
    }
  }

  // 5) Assemble — only submissions that actually carry a document.
  const out: FormDocument[] = []
  for (const i of instanceList) {
    const files = filesByInstance.get(i.id)
    if (!files || files.length === 0) continue
    const tpl = templateMap.get(i.template_id)
    out.push({
      instanceId: i.id,
      templateId: i.template_id,
      formName: tpl?.name ?? 'Form',
      category: tpl?.category ?? null,
      submitterId: i.user_id,
      submitterName: i.user_id ? (nameById.get(i.user_id) ?? null) : null,
      submittedAt: i.completed_at ?? i.created_at,
      reference: i.reference_number,
      approvalStatus: i.approval_status,
      status: i.purchasing_status === 'complete' ? 'complete' : 'outstanding',
      completedAt: i.purchasing_completed_at,
      completedByName: i.purchasing_completed_by
        ? (nameById.get(i.purchasing_completed_by) ?? null)
        : null,
      files,
    })
  }
  return out
}

/** Sets a form document's processing status (Outstanding <-> Complete). */
export async function setFormDocumentStatus(
  instanceId: string,
  status: FormDocumentStatus,
): Promise<{ ok: boolean; error?: string }> {
  const auth = await requireStaff()
  if ('error' in auth) return { ok: false, error: auth.error }

  const admin = createAdminClient()
  // Guard: only touch instances that belong to a purchasing-flagged template.
  const { data: inst } = await admin
    .from('internal_task_instances')
    .select('id, template:internal_task_templates(route_to_purchasing)')
    .eq('id', instanceId)
    .single()
  const tpl = (inst as { template?: { route_to_purchasing?: boolean } | { route_to_purchasing?: boolean }[] } | null)
    ?.template
  const flagged = Array.isArray(tpl) ? tpl[0]?.route_to_purchasing : tpl?.route_to_purchasing
  if (!inst || !flagged) return { ok: false, error: 'Not a purchasing document' }

  const complete = status === 'complete'
  const { error } = await admin
    .from('internal_task_instances')
    .update({
      purchasing_status: status,
      purchasing_completed_at: complete ? new Date().toISOString() : null,
      purchasing_completed_by: complete ? auth.userId : null,
    })
    .eq('id', instanceId)
  if (error) return { ok: false, error: error.message }

  revalidatePath(LIST_PATH)
  return { ok: true }
}
