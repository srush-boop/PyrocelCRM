import { del, get } from '@vercel/blob'
import { type NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { authorizeTaskAccess } from '@/lib/subcontractor/authorize'

// Load a task-owned document row + confirm the caller may access its call.
async function loadAuthorizedDoc(id: string) {
  const admin = createAdminClient()
  const { data: doc } = await admin
    .from('documents')
    .select('id, owner_type, owner_id, name, blob_pathname, blob_url, content_type, uploaded_by')
    .eq('id', id)
    .single()
  if (!doc || doc.owner_type !== 'task' || !doc.owner_id) {
    return { doc: null as null, auth: { ok: false, status: 404 } as const }
  }
  const auth = await authorizeTaskAccess(doc.owner_id)
  return { doc, auth }
}

// Stream a document for download/preview.
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { doc, auth } = await loadAuthorizedDoc(id)
  if (!doc || !auth.ok) return NextResponse.json({ error: 'Forbidden' }, { status: auth.status })

  try {
    // Prefer the stored private pathname; fall back to legacy full URL rows.
    const ref = doc.blob_pathname || doc.blob_url
    if (!ref) return new NextResponse('Not found', { status: 404 })
    const result = await get(ref, { access: 'private' })
    if (!result) return new NextResponse('Not found', { status: 404 })

    return new NextResponse(result.stream, {
      headers: {
        'Content-Type': result.blob.contentType || doc.content_type || 'application/octet-stream',
        'Content-Disposition': `inline; filename="${encodeURIComponent(doc.name)}"`,
        'Cache-Control': 'private, no-cache',
      },
    })
  } catch (error) {
    console.error('[v0] Subcontractor document delivery error:', error)
    return NextResponse.json({ error: 'Failed to serve file' }, { status: 500 })
  }
}

// Delete an upload. Only the person who uploaded it may remove it.
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const { doc, auth } = await loadAuthorizedDoc(id)
  if (!doc || !auth.ok || !auth.caller) {
    return NextResponse.json({ error: 'Forbidden' }, { status: auth.status })
  }
  // Subcontractors may only delete their own uploads.
  if (doc.uploaded_by !== auth.caller.profile.id) {
    return NextResponse.json({ error: 'You can only remove your own uploads.' }, { status: 403 })
  }

  const admin = createAdminClient()
  if (doc.blob_url) {
    try {
      await del(doc.blob_url)
    } catch (error) {
      console.error('[v0] Subcontractor blob delete error:', error)
    }
  }
  const { error } = await admin.from('documents').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
