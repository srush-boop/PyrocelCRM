import { createClient } from '@/lib/supabase/server'
import { getGlobalConfig } from '@/lib/actions/global-config'
import type { EmailFooter } from '@/lib/email/templates'

// The global_config key holding the company-wide default report email footer.
export const EMAIL_FOOTER_CONFIG_KEY = 'email_footer'

interface StoredFooter {
  message?: string | null
  imageUrl?: string | null
  links?: { label: string; url: string }[] | null
  enabled?: boolean | null
}

function normalise(raw: StoredFooter | null | undefined): EmailFooter | null {
  if (!raw) return null
  if (raw.enabled === false) return null
  const links = Array.isArray(raw.links)
    ? raw.links.filter((l) => l && l.label && l.url).map((l) => ({ label: l.label, url: l.url }))
    : []
  const message = (raw.message ?? '').trim()
  const imageUrl = (raw.imageUrl ?? '').trim()
  // Nothing worth rendering.
  if (!message && !imageUrl && links.length === 0) return null
  return {
    message: message || undefined,
    imageUrl: imageUrl || undefined,
    links,
    enabled: true,
  }
}

/**
 * Resolve the report-email footer for a given sending staff user.
 * Precedence: the user's own footer config (when enabled) → the global company
 * default → none. Returns undefined when there is nothing to render.
 */
export async function resolveEmailFooter(userId: string | null | undefined): Promise<EmailFooter | undefined> {
  // 1) Per-user footer.
  if (userId) {
    try {
      const supabase = await createClient()
      const { data } = await supabase
        .from('email_footer_configs')
        .select('message, image_url, links, enabled')
        .eq('user_id', userId)
        .maybeSingle()
      if (data) {
        const row = data as {
          message: string | null
          image_url: string | null
          links: { label: string; url: string }[] | null
          enabled: boolean | null
        }
        const userFooter = normalise({
          message: row.message,
          imageUrl: row.image_url,
          links: row.links,
          enabled: row.enabled,
        })
        if (userFooter) return userFooter
        // A user row that exists but is disabled/empty falls through to the global default.
      }
    } catch {
      // Ignore and fall back to the global default.
    }
  }

  // 2) Global default.
  try {
    const globalFooter = await getGlobalConfig<StoredFooter>(EMAIL_FOOTER_CONFIG_KEY)
    return normalise(globalFooter) ?? undefined
  } catch {
    return undefined
  }
}
