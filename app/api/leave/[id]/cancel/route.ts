import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { ANNUAL_LEAVE_TYPE_ID, getLeaveApprovers } from '@/lib/leave'
import { notifyUsers } from '@/lib/notifications'
import { format } from 'date-fns'

/**
 * Cancel an annual-leave booking WITHOUT deleting it. The record is kept and
 * stamped with who cancelled it, when and why, so there is a full audit trail;
 * every "who's off" calculation excludes cancelled entries, freeing the days
 * back up. The approver (whoever approved it, or the would-be approvers for a
 * still-pending request) is notified.
 *
 * Allowed for: the leave-taker (their own booking), the leave-taker's direct or
 * senior manager, or an admin/office user.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const { reason } = (await req.json()) as { reason?: string }
    const trimmedReason = (reason || '').trim()
    if (trimmedReason.length < 3) {
      return NextResponse.json(
        { error: 'Please give a reason for cancelling this leave.' },
        { status: 400 },
      )
    }

    const serverClient = await createClient()
    const {
      data: { user },
    } = await serverClient.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorised.' }, { status: 401 })

    const admin = createAdminClient()

    const [{ data: entry }, { data: caller }] = await Promise.all([
      admin
        .from('calendar_entries')
        .select(
          'id, user_id, entry_type_id, approval_status, approved_by, cancelled_at, start_at, end_at',
        )
        .eq('id', id)
        .single(),
      serverClient.from('profiles').select('id, role').eq('id', user.id).single(),
    ])

    if (!entry) return NextResponse.json({ error: 'Entry not found.' }, { status: 404 })
    if (entry.entry_type_id !== ANNUAL_LEAVE_TYPE_ID) {
      return NextResponse.json({ error: 'Not a leave entry.' }, { status: 400 })
    }
    if (entry.cancelled_at) {
      return NextResponse.json({ error: 'This leave is already cancelled.' }, { status: 400 })
    }

    // Authorisation: the leave-taker, admin/office, or the direct/senior manager.
    const subjectId = entry.user_id as string | null
    const isSelf = subjectId != null && subjectId === user.id
    const isAdminOrOffice = caller?.role === 'admin' || caller?.role === 'office'
    let isManager = false
    if (!isSelf && !isAdminOrOffice && subjectId) {
      const { data: subject } = await admin
        .from('profiles')
        .select('manager_id')
        .eq('id', subjectId)
        .single()
      isManager = subject?.manager_id === user.id
      if (!isManager && subject?.manager_id) {
        const { data: mgr } = await admin
          .from('profiles')
          .select('manager_id')
          .eq('id', subject.manager_id as string)
          .single()
        isManager = mgr?.manager_id === user.id
      }
    }
    if (!isSelf && !isAdminOrOffice && !isManager) {
      return NextResponse.json({ error: 'Forbidden.' }, { status: 403 })
    }

    const now = new Date().toISOString()
    const { error: updErr } = await admin
      .from('calendar_entries')
      .update({
        cancelled_at: now,
        cancelled_by: user.id,
        cancellation_reason: trimmedReason,
      })
      .eq('id', id)
    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 400 })

    // Notify the approver(s): whoever approved it, plus the would-be approvers
    // (covers still-pending requests). The person cancelling is excluded.
    const recipientSet = new Set<string>()
    if (entry.approved_by) recipientSet.add(entry.approved_by as string)
    if (subjectId) {
      for (const a of await getLeaveApprovers(subjectId)) recipientSet.add(a)
    }
    recipientSet.delete(user.id)

    if (recipientSet.size > 0) {
      // Resolve the leave-taker's name and the dates for a useful message.
      const { data: subjectProfile } = await admin
        .from('profiles')
        .select('full_name')
        .eq('id', subjectId ?? '')
        .maybeSingle()
      const who = (subjectProfile?.full_name as string | null) ?? 'A team member'
      const dateLabel = `${format(new Date(entry.start_at as string), 'd MMM')} – ${format(
        new Date(entry.end_at as string),
        'd MMM yyyy',
      )}`
      await notifyUsers({
        userIds: [...recipientSet],
        title: 'Annual leave cancelled',
        body: `${who} cancelled their annual leave (${dateLabel}): ${trimmedReason}`,
        url: '/dashboard/leave-summary',
        category: 'leave',
        createdBy: user.id,
        data: { kind: 'leave_cancelled', entryId: id, subjectUserId: subjectId },
      })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[v0] leave cancel error:', err)
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 })
  }
}
