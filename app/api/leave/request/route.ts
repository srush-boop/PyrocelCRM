import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { ANNUAL_LEAVE_TYPE_ID, getLeaveApprovers } from '@/lib/leave'
import { notifyUsers } from '@/lib/notifications'

/**
 * Sends the approval request to the leave-taker's manager (admins as fallback)
 * after an Annual Leave entry has been created/edited as 'requested'. The entry
 * itself is inserted client-side (respecting RLS); this route only fans out the
 * manager notification using the service role.
 */
export async function POST(req: NextRequest) {
  try {
    const { entryId } = await req.json()
    if (!entryId || typeof entryId !== 'string') {
      return NextResponse.json({ error: 'Missing entryId.' }, { status: 400 })
    }

    const serverClient = await createClient()
    const {
      data: { user },
    } = await serverClient.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorised.' }, { status: 401 })

    const admin = createAdminClient()
    const { data: entry } = await admin
      .from('calendar_entries')
      .select(
        'id, user_id, entry_type_id, approval_status, start_at, end_at, created_by, start_portion, end_portion, start_hours, end_hours',
      )
      .eq('id', entryId)
      .single()

    if (!entry) return NextResponse.json({ error: 'Entry not found.' }, { status: 404 })
    if (entry.entry_type_id !== ANNUAL_LEAVE_TYPE_ID) {
      return NextResponse.json({ error: 'Not a leave entry.' }, { status: 400 })
    }
    // Only the leave-taker or their creator may trigger the request notice.
    if (entry.created_by !== user.id && entry.user_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden.' }, { status: 403 })
    }
    if (entry.approval_status !== 'requested') {
      return NextResponse.json({ ok: true, skipped: true })
    }

    const subjectId = (entry.user_id as string) ?? user.id
    const approvers = await getLeaveApprovers(subjectId)
    if (approvers.length === 0) {
      return NextResponse.json({ ok: true, approvers: 0 })
    }

    const { data: subject } = await admin
      .from('profiles')
      .select('full_name, email')
      .eq('id', subjectId)
      .single()
    const who = subject?.full_name || subject?.email || 'A team member'

    const fmt = (s: string) =>
      new Date(s).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    const sameDay = fmt(entry.start_at as string) === fmt(entry.end_at as string)
    const range = sameDay
      ? fmt(entry.start_at as string)
      : `${fmt(entry.start_at as string)} – ${fmt(entry.end_at as string)}`

    // Note part-day requests so the approver sees them at a glance.
    const startPortion = (entry.start_portion as string | null) ?? 'full'
    const endPortion = (entry.end_portion as string | null) ?? 'full'
    let portionNote = ''
    if (startPortion === 'hours' || endPortion === 'hours') {
      const parts: string[] = []
      if (entry.start_hours != null) parts.push(`${entry.start_hours} hrs`)
      if (!sameDay && entry.end_hours != null) parts.push(`${entry.end_hours} hrs`)
      portionNote = parts.length > 0 ? `, ${parts.join(' + ')}` : ''
    } else if (startPortion === 'am' || startPortion === 'pm' || endPortion === 'am' || endPortion === 'pm') {
      portionNote = sameDay ? ', half day' : ', part days'
    }

    await notifyUsers({
      userIds: approvers,
      title: 'Annual leave request',
      body: `${who} has requested annual leave (${range}${portionNote}).`,
      url: '/dashboard/approvals',
      category: 'leave',
      createdBy: user.id,
      data: { kind: 'leave_request', entryId: entry.id, subjectUserId: subjectId },
    })

    return NextResponse.json({ ok: true, approvers: approvers.length })
  } catch (err) {
    console.error('[v0] leave request error:', err)
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 })
  }
}
