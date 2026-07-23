import 'server-only'
import webpush from 'web-push'
import { createAdminClient } from '@/lib/supabase/admin'
import { getVapidPublicKey } from '@/lib/push-vapid'

// Web push is optional: it only activates when VAPID keys are configured.
// In-app notifications always work regardless.
// Public key is resolved (validated env value, else baked-in fallback) so a
// corrupted env value can't silently disable push. Private key must stay in env.
const VAPID_PUBLIC = getVapidPublicKey()
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:notifications@example.com'

let pushConfigured = false
if (VAPID_PUBLIC && VAPID_PRIVATE) {
  try {
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE)
    pushConfigured = true
  } catch (err) {
    console.log('[v0] web-push VAPID setup failed:', (err as Error).message)
  }
}

export interface NotifyInput {
  /** Recipient profile ids. */
  userIds: string[]
  title: string
  body?: string | null
  url?: string | null
  category?: string
  data?: Record<string, unknown>
  /** The profile id of the actor creating the notification, if any. */
  createdBy?: string | null
}

/**
 * Creates in-app notification rows for each recipient and best-effort sends a
 * browser push to their subscribed devices. Uses the service-role client so it
 * can write rows for other users (bypassing RLS). Safe to call from server
 * actions / route handlers.
 */
export async function notifyUsers(input: NotifyInput): Promise<void> {
  const recipients = Array.from(new Set(input.userIds.filter(Boolean)))
  if (recipients.length === 0) return

  const admin = createAdminClient()

  // 1) Persist in-app notifications.
  const rows = recipients.map((userId) => ({
    user_id: userId,
    title: input.title,
    body: input.body ?? null,
    url: input.url ?? null,
    category: input.category ?? 'system',
    data: input.data ?? {},
    created_by: input.createdBy ?? null,
  }))

  const { error: insertError } = await admin.from('notifications').insert(rows)
  if (insertError) {
    console.log('[v0] Failed to insert notifications:', insertError.message)
  }

  // 2) Best-effort browser push.
  if (!pushConfigured) return

  const { data: subs } = await admin
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .in('user_id', recipients)

  if (!subs || subs.length === 0) return

  const payload = JSON.stringify({
    title: input.title,
    body: input.body ?? '',
    url: input.url ?? '/dashboard',
    category: input.category ?? 'system',
    // Forwarded so the service worker can tailor the notification (e.g. add the
    // lone-worker "I'm safe" action button and tap-to-acknowledge behaviour).
    data: input.data ?? {},
  })

  // Endpoints that are gone (404/410) should be pruned.
  const staleIds: string[] = []

  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          payload,
        )
      } catch (err) {
        const statusCode = (err as { statusCode?: number }).statusCode
        if (statusCode === 404 || statusCode === 410) {
          staleIds.push(sub.id)
        } else {
          console.log('[v0] Push send error:', (err as Error).message)
        }
      }
    }),
  )

  if (staleIds.length > 0) {
    await admin.from('push_subscriptions').delete().in('id', staleIds)
  }
}

/**
 * Resolves recipient profile ids from a mix of explicit user ids and roles.
 * Used by the admin composer to target users or groups.
 */
export async function resolveRecipients(opts: {
  userIds?: string[]
  roles?: string[]
}): Promise<string[]> {
  const admin = createAdminClient()
  const ids = new Set<string>((opts.userIds ?? []).filter(Boolean))

  if (opts.roles && opts.roles.length > 0) {
    const { data } = await admin.from('profiles').select('id').in('role', opts.roles)
    for (const row of data ?? []) ids.add(row.id as string)
  }

  return Array.from(ids)
}

export { pushConfigured }
