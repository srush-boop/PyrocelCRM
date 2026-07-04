import { type NextRequest, NextResponse } from 'next/server'
import { get } from '@vercel/blob'
import { createClient } from '@/lib/supabase/server'

// Streams a private training certificate. Looked up by training record id so we
// never trust a client-supplied blob path. Admin/office may view any; an
// employee may view their own (mirrors the training_records RLS policy).
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

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()
    const role = (profile as { role?: string } | null)?.role
    const isStaff = role === 'admin' || role === 'office'

    // RLS also enforces this, but scope the query explicitly for clarity: staff
    // can read any record, everyone else only their own.
    let query = supabase
      .from('training_records')
      .select('certificate_pathname, certificate_name, profile_id')
      .eq('id', id)
    if (!isStaff) {
      query = query.eq('profile_id', user.id)
    }
    const { data: record } = await query.single()

    if (!record?.certificate_pathname) {
      return new NextResponse('Not found', { status: 404 })
    }

    const result = await get(record.certificate_pathname, {
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

    const name = record.certificate_name || 'certificate'
    const disposition = download
      ? `attachment; filename="${encodeURIComponent(name)}"`
      : `inline; filename="${encodeURIComponent(name)}"`

    return new NextResponse(result.stream, {
      headers: {
        'Content-Type': result.blob.contentType,
        'Content-Disposition': disposition,
        ETag: result.blob.etag,
        'Cache-Control': 'private, no-cache',
      },
    })
  } catch (error) {
    console.error('[v0] Training certificate serve error:', error)
    return NextResponse.json({ error: 'Failed to serve file' }, { status: 500 })
  }
}
