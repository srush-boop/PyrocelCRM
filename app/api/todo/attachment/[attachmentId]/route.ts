import { get } from '@vercel/blob'
import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Authenticated delivery for a to-do attachment. RLS on todo_attachments already
// scopes SELECT to the item owner + assignees, so if the row is readable the
// caller is allowed to see the bytes. We look the row up first (RLS-checked),
// then stream the private blob it points at.
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ attachmentId: string }> },
) {
  const { attachmentId } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised.' }, { status: 401 })

  const { data: att } = await supabase
    .from('todo_attachments')
    .select('blob_path, file_name, content_type')
    .eq('id', attachmentId)
    .maybeSingle()
  if (!att) return NextResponse.json({ error: 'Not found.' }, { status: 404 })

  try {
    const result = await get(att.blob_path, { access: 'private' })
    if (!result) return new NextResponse('Not found', { status: 404 })
    return new NextResponse(result.stream, {
      headers: {
        'Content-Type': att.content_type || result.blob.contentType,
        'Content-Disposition': `attachment; filename="${att.file_name.replace(/"/g, '')}"`,
        'Cache-Control': 'private, no-cache',
      },
    })
  } catch (err) {
    console.error('[v0] todo attachment delivery error:', err)
    return NextResponse.json({ error: 'Failed to serve file.' }, { status: 500 })
  }
}
