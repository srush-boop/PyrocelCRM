import { del } from '@vercel/blob'
import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getDocumentAuth } from '@/lib/documents/auth'

// List attachments for a call (staff only).
export async function GET(request: NextRequest) {
  const auth = await getDocumentAuth()
  if (!auth.ok) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: auth.status })
  }

  const taskId = request.nextUrl.searchParams.get('task_id')
  if (!taskId) {
    return NextResponse.json({ error: 'Missing task_id' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('task_attachments')
    .select('*, uploader:profiles(id, full_name, email)')
    .eq('task_id', taskId)
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ attachments: data ?? [] })
}

// Delete an attachment. RLS restricts this to the uploader or admin/office.
export async function DELETE(request: NextRequest) {
  const auth = await getDocumentAuth()
  if (!auth.ok) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: auth.status })
  }

  const id = request.nextUrl.searchParams.get('id')
  if (!id) {
    return NextResponse.json({ error: 'Missing id' }, { status: 400 })
  }

  const supabase = await createClient()

  // Fetch first so we can clean up the blob after the row is removed.
  const { data: attachment } = await supabase
    .from('task_attachments')
    .select('blob_pathname')
    .eq('id', id)
    .single()

  const { error, count } = await supabase
    .from('task_attachments')
    .delete({ count: 'exact' })
    .eq('id', id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  if (!count) {
    // RLS blocked the delete (not the uploader / not a manager).
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  if (attachment?.blob_pathname) {
    try {
      await del(attachment.blob_pathname)
    } catch (err) {
      console.error('[v0] Task attachment blob delete error:', err)
    }
  }

  return NextResponse.json({ success: true })
}
