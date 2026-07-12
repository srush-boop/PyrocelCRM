import { type NextRequest, NextResponse } from 'next/server'
import { get } from '@vercel/blob'

/**
 * PUBLIC delivery route for signature images.
 *
 * Unlike `/api/blob` (which is session-gated for avatars/chat images), signatures
 * must be readable without authentication: they are embedded in client-facing
 * public token reports (`/r/[token]`) and fetched server-side by the RAMS PDF
 * renderer, neither of which carries a Supabase session cookie.
 *
 * Security: the Blob store is private, so bytes are only reachable through this
 * route, and only if the caller already knows the exact object pathname — which
 * contains a random suffix and is therefore unguessable. This mirrors the
 * possession-of-token model already used for public report links.
 *
 * Only paths under `signatures/` are served, so this route can't be abused to
 * read other private objects (avatars, chat images, tender packs, etc.).
 */
export async function GET(request: NextRequest) {
  const pathname = request.nextUrl.searchParams.get('pathname')
  if (!pathname) {
    return NextResponse.json({ error: 'Missing pathname' }, { status: 400 })
  }
  if (!pathname.startsWith('signatures/')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
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
          'Cache-Control': 'public, max-age=3600, must-revalidate',
        },
      })
    }

    return new NextResponse(result.stream, {
      headers: {
        'Content-Type': result.blob.contentType,
        ETag: result.blob.etag,
        'Cache-Control': 'public, max-age=3600, must-revalidate',
      },
    })
  } catch (error) {
    console.error('[v0] signature delivery error:', error)
    return NextResponse.json({ error: 'Failed to serve file' }, { status: 500 })
  }
}
