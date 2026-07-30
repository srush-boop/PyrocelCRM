import { put } from '@vercel/blob'
import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { validateUpload, scanForMalware, DOCUMENT_MIME_TYPES, MB } from '@/lib/uploads/validate'

// Supporting-document uploads for the Requests inbox (manual "Add request" flow).
// Files are stored privately under the `requests/` prefix and referenced from the
// inbound_requests.attachments jsonb; they are streamed back through /api/blob,
// which is authorised for that prefix (staff only). Scanning a PDF can be slow.
export const maxDuration = 60

export async function POST(request: NextRequest) {
  // Requests are an admin/office feature — gate uploads the same way.
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  const role = (profile as { role?: string } | null)?.role
  if (!role || !['admin', 'office'].includes(role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null

    const uploadCheck = validateUpload(file, { allow: DOCUMENT_MIME_TYPES, maxBytes: 25 * MB })
    if (!uploadCheck.ok) return uploadCheck.response
    const uploadScan = await scanForMalware(file as File)
    if (!uploadScan.ok) return uploadScan.response

    const f = file as File
    const safeName = f.name.replace(/[^\w.\-]+/g, '_')
    const pathname = `requests/${Date.now()}-${safeName}`
    const blob = await put(pathname, f, { access: 'private', addRandomSuffix: true })

    // Shape matches InboundAttachment so the client can store it as-is.
    return NextResponse.json({
      attachment: {
        name: f.name,
        pathname: blob.pathname,
        mimeType: f.type || null,
      },
    })
  } catch (error) {
    console.error('[v0] request attachment upload error:', error)
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
  }
}
