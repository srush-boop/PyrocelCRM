import 'server-only'
import { startOfDay, endOfDay } from 'date-fns'
import { createClient } from '@/lib/supabase/server'
import type { Profile } from '@/lib/types/database'
import type { SimpleSectionKey } from '@/lib/config/simple-app'
import { getVisibleLeaveRequests } from '@/lib/leave-approvals'
import { getPendingApprovals, getMyTasks } from '@/lib/actions/internal-tasks'
import { computeLeaveBalances } from '@/lib/leave'
import { getChatUnreadCount } from '@/lib/chat/queries'

export interface SimpleCount {
  /** Raw number backing the summary (0 when nothing outstanding). */
  count: number
  /** Short human line shown under the tile title. */
  summary: string
  /** Highlights the tile (e.g. things awaiting action). */
  alert?: boolean
}

export type SimpleCounts = Partial<Record<SimpleSectionKey, SimpleCount>>

/**
 * Live summaries for the Simple-Mode home tiles. Only the requested keys are
 * computed, and every source is wrapped so a single failure never blocks the
 * home from rendering.
 */
export async function getSimpleHomeCounts(
  profile: Profile,
  keys: SimpleSectionKey[],
): Promise<SimpleCounts> {
  const want = new Set(keys)
  const out: SimpleCounts = {}

  const tasks: Promise<void>[] = []

  if (want.has('approvals')) {
    tasks.push(
      (async () => {
        try {
          const [{ pending }, forms] = await Promise.all([
            getVisibleLeaveRequests(),
            getPendingApprovals(),
          ])
          const formCount = forms.ok ? (forms.instances ?? []).length : 0
          const total = pending.length + formCount
          out.approvals = {
            count: total,
            summary: total === 0 ? 'All clear' : `${total} awaiting approval`,
            alert: total > 0,
          }
        } catch {
          out.approvals = { count: 0, summary: 'View approvals' }
        }
      })(),
    )
  }

  if (want.has('tasks')) {
    tasks.push(
      (async () => {
        try {
          const res = await getMyTasks()
          const open = (res.instances ?? []).filter((i) => i.status !== 'completed').length
          out.tasks = {
            count: open,
            summary: open === 0 ? 'Nothing to complete' : `${open} to complete`,
            alert: open > 0,
          }
        } catch {
          out.tasks = { count: 0, summary: 'View tasks & forms' }
        }
      })(),
    )
  }

  if (want.has('notifications')) {
    tasks.push(
      (async () => {
        try {
          const supabase = await createClient()
          const { count } = await supabase
            .from('notifications')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', profile.id)
            .is('read_at', null)
          const unread = count ?? 0
          out.notifications = {
            count: unread,
            summary: unread === 0 ? 'No new reminders' : `${unread} unread`,
            alert: unread > 0,
          }
        } catch {
          out.notifications = { count: 0, summary: 'View reminders' }
        }
      })(),
    )
  }

  if (want.has('calendar')) {
    tasks.push(
      (async () => {
        try {
          const supabase = await createClient()
          const now = new Date()
          const { count } = await supabase
            .from('calendar_entries')
            .select('id', { count: 'exact', head: true })
            .is('cancelled_at', null)
            .lte('start_at', endOfDay(now).toISOString())
            .gte('end_at', startOfDay(now).toISOString())
          const today = count ?? 0
          out.calendar = {
            count: today,
            summary: today === 0 ? 'Nothing scheduled today' : `${today} on today`,
          }
        } catch {
          out.calendar = { count: 0, summary: 'View calendar' }
        }
      })(),
    )
  }

  if (want.has('leave')) {
    tasks.push(
      (async () => {
        try {
          const balances = await computeLeaveBalances()
          const bal = balances.get(profile.id)
          const remaining = bal?.remainingDays ?? null
          out.leave = {
            count: remaining ?? 0,
            summary:
              remaining == null
                ? 'Book & view leave'
                : `${remaining} ${remaining === 1 ? 'day' : 'days'} left`,
          }
        } catch {
          out.leave = { count: 0, summary: 'Book & view leave' }
        }
      })(),
    )
  }

  if (want.has('chat')) {
    tasks.push(
      (async () => {
        try {
          const unread = await getChatUnreadCount(profile.id)
          out.chat = {
            count: unread,
            summary: unread === 0 ? 'No new messages' : `${unread} unread`,
            alert: unread > 0,
          }
        } catch {
          out.chat = { count: 0, summary: 'Open chat' }
        }
      })(),
    )
  }

  await Promise.all(tasks)
  return out
}
