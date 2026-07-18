import { type NextRequest, NextResponse } from 'next/server'
import { get } from '@vercel/blob'
import { createClient } from '@/lib/supabase/server'

// Streams a private internal-task attachment. The row is looked up with the
// user-scoped client so RLS only returns it to the owner (or a quality
// manager); we never trust a client-supplied blob path directly.
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const id = request.nextUrl.searchParams.get('id')
    const download = request.nextUrl.searchParams.get('download') === '1'
    if (!id) {
      return NextResponse.json({ error: 'Missing id' }, { status: 400 })
    }

    const { data: attachment } = await supabase
      .from('internal_task_attachments')
      .select('blob_pathname, name, content_type')
      .eq('id', id)
      .single()

    if (!attachment) {
      return new NextResponse('Not found', { status: 404 })
    }

    const result = await get(attachment.blob_pathname, {
      access: 'private',
      ifNoneMatch: request.headers.get('if-none-match') ?? undefined,
    })
    if (!result) {
      return new NextResponse('Not found', { status: 404 })
    }
    if (result.statusCode === 304) {
      return new NextResponse(null, {
        status: 304,
        headers: { ETag: result.blob.etag, 'Cache-Control': 'private, no-cache' },
      })
    }

    const disposition = download
      ? `attachment; filename="${encodeURIComponent(attachment.name)}"`
      : `inline; filename="${encodeURIComponent(attachment.name)}"`

    return new NextResponse(result.stream, {
      headers: {
        'Content-Type': attachment.content_type || result.blob.contentType,
        'Content-Disposition': disposition,
        ETag: result.blob.etag,
        'Cache-Control': 'private, no-cache',
      },
    })
  } catch (error) {
    console.error('[v0] Internal task attachment serve error:', error)
    return NextResponse.json({ error: 'Failed to serve file' }, { status: 500 })
  }
}
