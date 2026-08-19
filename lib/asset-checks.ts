import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { dueStatus } from '@/lib/assets'
import type { AssetCheckSchedule } from '@/lib/types/database'

/** A due/overdue asset check schedule with its (non-disposed) asset attached. */
export type MyAssetCheck = AssetCheckSchedule & {
  asset: {
    id: string
    urn: string
    name: string
    status: string
    assigned_to: string | null
  } | null
}

/**
 * Returns the asset checks that are the signed-in user's responsibility AND are
 * currently overdue or due soon (next 14 days) — the exact set the daily
 * asset-checks cron would notify them about.
 *
 * Recipient logic mirrors `app/api/cron/asset-checks/route.ts` so the task list
 * and the notification bell always agree:
 *   - holder-responsible check on an assigned asset → the holder;
 *   - otherwise → the asset managers (admin / office).
 *
 * Read with the admin client (like the cron) so a manager sees manager-owned
 * checks across all assets, not only those RLS would scope to them, while the
 * per-user recipient filter keeps holders limited to their own kit.
 */
export async function getMyAssetChecks(): Promise<MyAssetCheck[]> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return []

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  const role = profile?.role as string | undefined
  if (!role || role === 'client') return []
  const isManager = role === 'admin' || role === 'office'

  const admin = createAdminClient()
  const { data: schedules, error } = await admin
    .from('asset_check_schedules')
    .select(
      `*, asset:assets!inner(id, urn, name, status, assigned_to)`,
    )
    .eq('active', true)
    .not('next_due_date', 'is', null)
    .order('next_due_date', { ascending: true })

  if (error) {
    console.log('[v0] getMyAssetChecks query failed:', error.message)
    return []
  }

  const mine: MyAssetCheck[] = []
  for (const s of schedules ?? []) {
    const asset = Array.isArray(s.asset) ? s.asset[0] : s.asset
    if (!asset || asset.status === 'disposed') continue

    const st = dueStatus(s.next_due_date)
    if (st !== 'overdue' && st !== 'due_soon') continue

    // Is the current user a recipient for this check?
    const isRecipient =
      s.responsible === 'holder' && asset.assigned_to
        ? asset.assigned_to === user.id
        : isManager
    if (!isRecipient) continue

    mine.push({ ...(s as AssetCheckSchedule), asset } as MyAssetCheck)
  }

  return mine
}
