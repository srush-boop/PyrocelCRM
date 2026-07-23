import { type NextRequest, NextResponse } from 'next/server'
import { get } from '@vercel/blob'
import { createClient } from '@/lib/supabase/server'
import { authorizeBlobAccess } from '@/lib/blob-access'

/**
 * Authenticated delivery route for private Blob objects (avatars, chat images).
 * The Blob store is private, so the raw blob URLs are not publicly readable —
 * everything is streamed through here after we confirm the caller is signed in.
 * The client references files as `/api/blob?pathname=<pathname>`.
 *
 * Caching uses `private, no-cache` + ETag revalidation so browsers keep a local
 * copy but re-check on each request, avoiding repeated full downloads.
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const pathname = request.nextUrl.searchParams.get('pathname')
  if (!pathname) {
    return NextResponse.json({ error: 'Missing pathname' }, { status: 400 })
  }

  // Per-object authorization: this generic proxy may only serve the prefixes it
  // was built for (avatars/chat), and internal content is denied to portal
  // clients. Everything else has its own authorization-checked route.
  const denied = await authorizeBlobAccess('blob', pathname, supabase, user.id)
  if (denied) {
    return NextResponse.json({ error: denied.message }, { status: denied.status })
  }

  try {
    const result = await get(pathname, {
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

    return new NextResponse(result.stream, {
      headers: {
        'Content-Type': result.blob.contentType,
        ETag: result.blob.etag,
        'Cache-Control': 'private, no-cache',
      },
    })
  } catch (error) {
    console.error('[v0] blob delivery error:', error)
    return NextResponse.json({ error: 'Failed to serve file' }, { status: 500 })
  }
}
