import { type NextRequest, NextResponse } from 'next/server'
import { get } from '@vercel/blob'
import { createClient } from '@/lib/supabase/server'
import { getDocumentAuth } from '@/lib/documents/auth'

// Streams a private document to authenticated staff. The document is looked up
// by id so we never trust a client-supplied blob path directly.
export async function GET(request: NextRequest) {
  const auth = await getDocumentAuth()
  if (!auth.ok) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: auth.status })
  }

  try {
    const id = request.nextUrl.searchParams.get('id')
    const download = request.nextUrl.searchParams.get('download') === '1'
    if (!id) {
      return NextResponse.json({ error: 'Missing id' }, { status: 400 })
    }

    const supabase = await createClient()
    const { data: doc } = await supabase
      .from('documents')
      .select('blob_pathname, name, content_type')
      .eq('id', id)
      .single()

    if (!doc) {
      return new NextResponse('Not found', { status: 404 })
    }

    const result = await get(doc.blob_pathname, {
      access: 'private',
      ifNoneMatch: request.headers.get('if-none-match') ?? undefined,
    })

    if (!result) {
      return new NextResponse('Not found', { status: 404 })
    }

    if (result.statusCode === 304) {
      return new NextResponse(null, {
        status: 304,
        headers: {
          ETag: result.blob.etag,
          'Cache-Control': 'private, no-cache',
        },
      })
    }

    const disposition = download
      ? `attachment; filename="${encodeURIComponent(doc.name)}"`
      : `inline; filename="${encodeURIComponent(doc.name)}"`

    return new NextResponse(result.stream, {
      headers: {
        'Content-Type': doc.content_type || result.blob.contentType,
        'Content-Disposition': disposition,
        ETag: result.blob.etag,
        'Cache-Control': 'private, no-cache',
      },
    })
  } catch (error) {
    console.error('[v0] Document serve error:', error)
    return NextResponse.json({ error: 'Failed to serve file' }, { status: 500 })
  }
}
