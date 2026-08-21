import { type NextRequest, NextResponse } from 'next/server'
import { get } from '@vercel/blob'
import { createClient } from '@/lib/supabase/server'

/**
 * Authenticated delivery of a vault document. Visibility inherits the parent
 * section's roles: the SELECT RLS policy on vault_documents only returns the row
 * to admins and to staff whose role is in the section's `visible_roles`, so if
 * the query below returns a row the caller is allowed to read it.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: doc, error } = await supabase
    .from('vault_documents')
    .select('blob_pathname, name, content_type')
    .eq('id', id)
    .single()
  if (error || !doc) {
    // RLS hides rows the user may not see, so this covers both missing + denied.
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  try {
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
        headers: { ETag: result.blob.etag, 'Cache-Control': 'private, no-cache' },
      })
    }

    const inline = request.nextUrl.searchParams.get('download') !== '1'
    const safeName = (doc.name || 'document').replace(/"/g, '')
    return new NextResponse(result.stream, {
      headers: {
        'Content-Type': doc.content_type || result.blob.contentType,
        'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${safeName}"`,
        ETag: result.blob.etag,
        'Cache-Control': 'private, no-cache',
      },
    })
  } catch (err) {
    console.error('[v0] Vault document delivery error:', err)
    return NextResponse.json({ error: 'Failed to serve file' }, { status: 500 })
  }
}
