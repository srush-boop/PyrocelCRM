import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { ANNUAL_LEAVE_TYPE_ID, getAccountsAndAdminIds } from '@/lib/leave'
import { notifyUsers } from '@/lib/notifications'

/**
 * Approve or reject an annual leave request. Only the leave-taker's nominated
 * manager, or an admin/office user, may decide. On approval the leave-taker and
 * Accounts are notified; on rejection the leave-taker is notified with a reason.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const { action, reason } = (await req.json()) as {
      action?: 'approve' | 'reject'
      reason?: string
    }
    if (action !== 'approve' && action !== 'reject') {
      return NextResponse.json({ error: 'Invalid action.' }, { status: 400 })
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
        .select('id, user_id, entry_type_id, approval_status')
        .eq('id', id)
        .single(),
      serverClient.from('profiles').select('id, role').eq('id', user.id).single(),
    ])

    if (!entry) return NextResponse.json({ error: 'Entry not found.' }, { status: 404 })
    if (entry.entry_type_id !== ANNUAL_LEAVE_TYPE_ID) {
      return NextResponse.json({ error: 'Not a leave entry.' }, { status: 400 })
    }

    // Authorisation: admin/office, or the leave-taker's nominated manager.
    const isAdminOrOffice = caller?.role === 'admin' || caller?.role === 'office'
    let isManager = false
    if (!isAdminOrOffice && entry.user_id) {
      const { data: subject } = await admin
        .from('profiles')
        .select('manager_id')
        .eq('id', entry.user_id as string)
        .single()
      isManager = subject?.manager_id === user.id
    }
    if (!isAdminOrOffice && !isManager) {
      return NextResponse.json({ error: 'Forbidden.' }, { status: 403 })
    }

    const now = new Date().toISOString()
    const patch =
      action === 'approve'
        ? { approval_status: 'approved' as const, approved_by: user.id, approved_at: now, rejection_reason: null }
        : {
            approval_status: 'rejected' as const,
            approved_by: user.id,
            approved_at: now,
            rejection_reason: (reason || '').trim() || null,
          }

    const { error: updErr } = await admin
      .from('calendar_entries')
      .update(patch)
      .eq('id', id)
    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 400 })

    const subjectId = entry.user_id as string | null

    if (action === 'approve') {
      // Notify the leave-taker and Accounts.
      const accounts = await getAccountsAndAdminIds()
      if (subjectId) {
        await notifyUsers({
          userIds: [subjectId],
          title: 'Annual leave approved',
          body: 'Your annual leave request has been approved.',
          url: '/dashboard/my-leave',
          category: 'leave',
          createdBy: user.id,
          data: { kind: 'leave_approved', entryId: id },
        })
      }
      await notifyUsers({
        userIds: accounts.filter((a) => a !== subjectId),
        title: 'Annual leave approved',
        body: 'A leave request has been approved and is now booked.',
        url: '/dashboard/leave-summary',
        category: 'leave',
        createdBy: user.id,
        data: { kind: 'leave_approved_accounts', entryId: id, subjectUserId: subjectId },
      })
    } else if (subjectId) {
      await notifyUsers({
        userIds: [subjectId],
        title: 'Annual leave declined',
        body: patch.rejection_reason
          ? `Your leave request was declined: ${patch.rejection_reason}`
          : 'Your annual leave request was declined.',
        url: '/dashboard/my-leave',
        category: 'leave',
        createdBy: user.id,
        data: { kind: 'leave_rejected', entryId: id },
      })
    }

    return NextResponse.json({ ok: true, status: patch.approval_status })
  } catch (err) {
    console.error('[v0] leave decision error:', err)
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 })
  }
}
