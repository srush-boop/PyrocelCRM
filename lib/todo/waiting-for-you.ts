import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { listChannels } from '@/lib/chat/queries'
import { getVisibleLeaveRequests } from '@/lib/leave-approvals'
import { getReviewQueue } from '@/lib/actions/timesheets'
import { getPendingApprovals, getMissedTaskEscalations } from '@/lib/actions/internal-tasks'
import { getPurchaseInvoiceApprovals } from '@/lib/actions/purchase-invoices'
import type { UserRole } from '@/lib/types/database'

// A single actionable line inside a bucket.
export interface WaitingItem {
  id: string
  title: string
  subtitle?: string | null
  href: string
  // ISO timestamp used for ordering / "x ago" display.
  timestamp?: string | null
  // Whether the user can manually dismiss this line from their inbox. The id
  // doubles as the dismissal key. Defaults to dismissible; chat (which
  // auto-clears when the thread is read) opts out.
  dismissible?: boolean
}

// One source group of things awaiting the user.
export interface WaitingBucket {
  key: string
  label: string
  // lucide icon name (resolved on the client to avoid importing icons server-side)
  icon: string
  count: number
  href: string
  items: WaitingItem[]
}

const STAFF_ROLES: UserRole[] = ['admin', 'office']

// Runs a source safely: any thrown error yields null so one broken source never
// blanks the whole panel.
async function safe<T>(fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn()
  } catch (err) {
    console.log('[v0] waiting-for-you source failed:', (err as Error).message)
    return null
  }
}

/**
 * Aggregates everything awaiting the signed-in user across the CRM into typed
 * buckets. Role-gated: approvals + client requests only surface for staff who
 * already have access to those screens; everyone gets their own tasks, chat and
 * notifications.
 */
export async function getWaitingForYou(
  userId: string,
  role: UserRole,
): Promise<WaitingBucket[]> {
  const supabase = await createClient()
  const isStaff = STAFF_ROLES.includes(role)
  const buckets: WaitingBucket[] = []

  // Keys the user has manually dismissed from their inbox. Anything still
  // "live" but explicitly dismissed is hidden; anything that has actually been
  // actioned drops out of its source query on its own (auto-clear).
  const dismissed = (await safe(async () => {
    const { data } = await supabase
      .from('todo_waiting_dismissals')
      .select('item_key')
      .eq('user_id', userId)
    return new Set((data ?? []).map((d: { item_key: string }) => d.item_key))
  })) ?? new Set<string>()
  const keep = (id: string) => !dismissed.has(id)

  // 1) Approvals (leave, forms/tasks, timesheets, missed tasks, purchase invoices)
  if (isStaff) {
    const approvals = await safe(async () => {
      const [leave, timesheets, forms, missed, purchase] = await Promise.all([
        getVisibleLeaveRequests(),
        getReviewQueue(),
        getPendingApprovals(),
        getMissedTaskEscalations(),
        getPurchaseInvoiceApprovals(),
      ])
      const items: WaitingItem[] = []
      const pendingLeave = (leave?.pending ?? []).filter((l) => keep(`leave-${l.id}`))
      for (const l of pendingLeave.slice(0, 6)) {
        items.push({
          id: `leave-${l.id}`,
          title: `${l.userName || 'Someone'} — leave request`,
          subtitle: l.departmentName ?? 'Annual leave',
          href: '/dashboard/approvals',
          timestamp: l.startAt ?? null,
        })
      }
      const formItems = (forms.ok ? forms.instances ?? [] : []).filter((f) =>
        keep(`form-${f.id}`),
      )
      for (const f of formItems.slice(0, 6)) {
        items.push({
          id: `form-${f.id}`,
          title: f.reference_number ?? 'Form submission',
          subtitle: 'Awaiting approval',
          href: '/dashboard/approvals',
          timestamp: f.completed_at ?? null,
        })
      }
      const missedItems = (missed.ok ? missed.instances ?? [] : []).filter((m) =>
        keep(`missed-${m.id}`),
      )
      for (const m of missedItems.slice(0, 6)) {
        items.push({
          id: `missed-${m.id}`,
          title: m.reference_number ?? 'Missed task',
          subtitle: 'Escalated — needs review',
          href: '/dashboard/approvals',
          timestamp: m.due_at ?? null,
        })
      }
      const purchaseItems = (purchase.ok ? purchase.invoices ?? [] : []).filter((p) =>
        keep(`pi-${p.id}`),
      )
      for (const p of purchaseItems.slice(0, 6)) {
        items.push({
          id: `pi-${p.id}`,
          title: p.name ?? 'Purchase invoice',
          subtitle: p.supplier_ref ?? 'Awaiting your approval',
          href: '/dashboard/invoices/purchase-invoices',
          timestamp: p.created_at ?? null,
        })
      }
      const count =
        pendingLeave.length +
        formItems.length +
        missedItems.length +
        purchaseItems.length +
        (timesheets?.length ?? 0)
      return { items, count }
    })
    if (approvals && approvals.count > 0) {
      buckets.push({
        key: 'approvals',
        label: 'Approvals',
        icon: 'ClipboardCheck',
        count: approvals.count,
        href: '/dashboard/approvals',
        items: approvals.items,
      })
    }
  }

  // 2) My tasks & forms due (internal task instances assigned to me, open, due)
  {
    const tasks = await safe(async () => {
      const nowIso = new Date().toISOString()
      const { data } = await supabase
        .from('internal_task_instances')
        .select('id, due_at, status, template:internal_task_templates(name)')
        .eq('assigned_to', userId)
        .neq('status', 'completed')
        .lte('due_at', nowIso)
        .order('due_at', { ascending: true })
        .limit(20)
      const rows = ((data ?? []) as unknown as {
        id: string
        due_at: string | null
        template: { name: string | null } | { name: string | null }[] | null
      }[]).filter((r) => keep(`task-${r.id}`))
      const items: WaitingItem[] = rows.map((r) => {
        const tpl = Array.isArray(r.template) ? r.template[0] : r.template
        return {
          id: `task-${r.id}`,
          title: tpl?.name ?? 'Task',
          subtitle: 'Due now',
          href: '/dashboard/my-tasks',
          timestamp: r.due_at,
        }
      })
      return { items, count: rows.length }
    })
    if (tasks && tasks.count > 0) {
      buckets.push({
        key: 'tasks',
        label: 'Tasks & forms due',
        icon: 'ClipboardList',
        count: tasks.count,
        href: '/dashboard/my-tasks',
        items: tasks.items,
      })
    }
  }

  // 3) Unread chat (per-channel breakdown)
  {
    const chat = await safe(async () => {
      const channels = await listChannels(userId)
      const withUnread = channels.filter((c) => c.unread > 0)
      const items: WaitingItem[] = withUnread.slice(0, 8).map((c) => ({
        id: `chat-${c.id}`,
        title: c.name ?? 'Chat',
        subtitle: `${c.unread} unread`,
        href: `/dashboard/chat?channel=${c.id}`,
        timestamp: null,
        // Chat clears itself once the thread is read — no manual dismiss.
        dismissible: false,
      }))
      const count = withUnread.reduce((sum, c) => sum + c.unread, 0)
      return { items, count }
    })
    if (chat && chat.count > 0) {
      buckets.push({
        key: 'chat',
        label: 'Unread messages',
        icon: 'MessageSquareText',
        count: chat.count,
        href: '/dashboard/chat',
        items: chat.items,
      })
    }
  }

  // 4) Client requests (Requests inbox) — staff only
  if (isStaff) {
    const requests = await safe(async () => {
      const { data } = await supabase
        .from('inbound_requests')
        .select('id, subject, from_email, received_at, status')
        .eq('status', 'new')
        .order('received_at', { ascending: false })
        .limit(10)
      const rows = ((data ?? []) as {
        id: string
        subject: string | null
        from_email: string | null
        received_at: string | null
      }[]).filter((r) => keep(`req-${r.id}`))
      const items: WaitingItem[] = rows.map((r) => ({
        id: `req-${r.id}`,
        title: r.subject ?? 'Client request',
        subtitle: r.from_email ?? null,
        href: '/dashboard/requests',
        timestamp: r.received_at,
      }))
      return { items, count: rows.length }
    })
    if (requests && requests.count > 0) {
      buckets.push({
        key: 'requests',
        label: 'Client requests',
        icon: 'Inbox',
        count: requests.count,
        href: '/dashboard/requests',
        items: requests.items,
      })
    }
  }

  // 5) Unread notifications
  {
    const notifs = await safe(async () => {
      const { data } = await supabase
        .from('notifications')
        .select('id, title, body, url, created_at')
        .eq('user_id', userId)
        .is('read_at', null)
        .order('created_at', { ascending: false })
        .limit(10)
      const rows = ((data ?? []) as {
        id: string
        title: string | null
        body: string | null
        url: string | null
        created_at: string | null
      }[]).filter((r) => keep(`notif-${r.id}`))
      const items: WaitingItem[] = rows.map((r) => ({
        id: `notif-${r.id}`,
        title: r.title ?? 'Notification',
        subtitle: r.body ?? null,
        href: r.url ?? '/dashboard/notifications',
        timestamp: r.created_at,
      }))
      return { items, count: rows.length }
    })
    if (notifs && notifs.count > 0) {
      buckets.push({
        key: 'notifications',
        label: 'Notifications',
        icon: 'Bell',
        count: notifs.count,
        href: '/dashboard/notifications',
        items: notifs.items,
      })
    }
  }

  return buckets
}

/** Total count across all buckets — used for the header badge. */
export function totalWaiting(buckets: WaitingBucket[]): number {
  return buckets.reduce((sum, b) => sum + b.count, 0)
}
