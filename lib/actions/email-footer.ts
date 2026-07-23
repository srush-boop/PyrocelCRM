'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { getGlobalConfig, setGlobalConfig } from '@/lib/actions/global-config'
import { EMAIL_FOOTER_CONFIG_KEY } from '@/lib/email/footer'

export interface EmailFooterLink {
  label: string
  url: string
}

export interface EmailFooterValues {
  message: string
  imageUrl: string
  links: EmailFooterLink[]
  enabled: boolean
}

const EMPTY: EmailFooterValues = { message: '', imageUrl: '', links: [], enabled: true }

function sanitise(input: Partial<EmailFooterValues> | null | undefined): EmailFooterValues {
  if (!input) return { ...EMPTY }
  const links = Array.isArray(input.links)
    ? input.links
        .map((l) => ({ label: (l?.label ?? '').trim(), url: (l?.url ?? '').trim() }))
        .filter((l) => l.label && l.url)
        .slice(0, 6)
    : []
  return {
    message: (input.message ?? '').trim(),
    imageUrl: (input.imageUrl ?? '').trim(),
    links,
    enabled: input.enabled !== false,
  }
}

/** The signed-in user's own report-email footer. */
export async function getMyEmailFooter(): Promise<EmailFooterValues> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ...EMPTY }

  const { data } = await supabase
    .from('email_footer_configs')
    .select('message, image_url, links, enabled')
    .eq('user_id', user.id)
    .maybeSingle()

  if (!data) return { ...EMPTY }
  const row = data as {
    message: string | null
    image_url: string | null
    links: EmailFooterLink[] | null
    enabled: boolean | null
  }
  return sanitise({
    message: row.message ?? '',
    imageUrl: row.image_url ?? '',
    links: row.links ?? [],
    enabled: row.enabled ?? true,
  })
}

/** Save the signed-in user's report-email footer. */
export async function saveMyEmailFooter(
  values: EmailFooterValues,
): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Not signed in' }

  const clean = sanitise(values)
  const { error } = await supabase.from('email_footer_configs').upsert(
    {
      user_id: user.id,
      message: clean.message || null,
      image_url: clean.imageUrl || null,
      links: clean.links,
      enabled: clean.enabled,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' },
  )

  if (error) return { error: error.message }
  revalidatePath('/dashboard/settings')
  return { error: null }
}

/** The company-wide default footer (used when a sender has no footer of their own). */
export async function getGlobalEmailFooter(): Promise<EmailFooterValues> {
  const raw = await getGlobalConfig<Partial<EmailFooterValues>>(EMAIL_FOOTER_CONFIG_KEY)
  return sanitise(raw)
}

/** Save the company-wide default footer (admin/office only, enforced in setGlobalConfig). */
export async function saveGlobalEmailFooter(
  values: EmailFooterValues,
): Promise<{ error: string | null }> {
  const clean = sanitise(values)
  return setGlobalConfig(EMAIL_FOOTER_CONFIG_KEY, clean)
}
