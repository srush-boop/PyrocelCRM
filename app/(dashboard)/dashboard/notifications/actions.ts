'use server'

import { createClient } from '@/lib/supabase/server'
import { notifyUsers, resolveRecipients } from '@/lib/notifications'
import { revalidatePath } from 'next/cache'

/** Saves (upserts) the current user's web push subscription. */
export async function savePushSubscription(sub: {
  endpoint: string
  p256dh: string
  auth: string
  userAgent?: string
}): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not authenticated.' }

  // Endpoint is unique; upsert keeps one row per device.
  const { error } = await supabase.from('push_subscriptions').upsert(
    {
      user_id: user.id,
      endpoint: sub.endpoint,
      p256dh: sub.p256dh,
      auth: sub.auth,
      user_agent: sub.userAgent ?? null,
    },
    { onConflict: 'endpoint' },
  )
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

/** Removes a web push subscription for the current user. */
export async function removePushSubscription(
  endpoint: string,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not authenticated.' }

  const { error } = await supabase
    .from('push_subscriptions')
    .delete()
    .eq('user_id', user.id)
    .eq('endpoint', endpoint)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

/** Marks a single notification (or all) as read for the current user. */
export async function markNotificationsRead(
  notificationId?: string,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not authenticated.' }

  let query = supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('user_id', user.id)
    .is('read_at', null)
  if (notificationId) query = query.eq('id', notificationId)

  const { error } = await query
  if (error) return { ok: false, error: error.message }
  revalidatePath('/dashboard')
  return { ok: true }
}

/**
 * Admin/office composer: push a notification to selected users and/or roles.
 */
export async function sendAdminNotification(input: {
  title: string
  body: string
  url?: string
  userIds?: string[]
  roles?: string[]
}): Promise<{ ok: boolean; error?: string; count?: number }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not authenticated.' }

  // Only admin/office may broadcast.
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  if (!profile || !['admin', 'office'].includes(profile.role)) {
    return { ok: false, error: 'You do not have permission to send notifications.' }
  }

  if (!input.title.trim()) return { ok: false, error: 'A title is required.' }

  const recipients = await resolveRecipients({
    userIds: input.userIds,
    roles: input.roles,
  })
  if (recipients.length === 0) {
    return { ok: false, error: 'No recipients matched your selection.' }
  }

  await notifyUsers({
    userIds: recipients,
    title: input.title.trim(),
    body: input.body.trim() || null,
    url: input.url?.trim() || null,
    category: 'admin',
    createdBy: user.id,
  })

  return { ok: true, count: recipients.length }
}
