import { type NextRequest, NextResponse } from 'next/server'
import { get } from '@vercel/blob'
import { createClient } from '@/lib/supabase/server'
import { getTenderApiUser } from '@/lib/tender/access'

// Streams a private evidence file to authorised tender users. Looked up by
// evidence id so we never trust a client-supplied blob path.
export async function GET(request: NextRequest) {
  const user = await getTenderApiUser()
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const id = request.nextUrl.searchParams.get('id')
  const download = request.nextUrl.searchParams.get('download') === '1'
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const supabase = await createClient()
  const { data: row } = await supabase
    .from('tender_evidence')
    .select('file_url, file_name, file_type')
    .eq('id', id)
    .single()

  if (!row?.file_url) return new NextResponse('Not found', { status: 404 })

  const result = await get(row.file_url, { access: 'private' })
  if (!result) return new NextResponse('Not found', { status: 404 })

  const name = row.file_name ?? 'evidence'
  const disposition = download
    ? `attachment; filename="${encodeURIComponent(name)}"`
    : `inline; filename="${encodeURIComponent(name)}"`

  return new NextResponse(result.stream, {
    headers: {
      'Content-Type': row.file_type || result.blob.contentType,
      'Content-Disposition': disposition,
      'Cache-Control': 'private, no-cache',
    },
  })
}
