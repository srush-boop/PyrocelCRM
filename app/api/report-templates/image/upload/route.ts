import { put } from '@vercel/blob'
import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { validateUpload, scanForMalware, IMAGE_MIME_TYPES, MB } from '@/lib/uploads/validate'

// Uploads a report-designer image: either a template logo or a custom image
// block. Report images appear on CLIENT-FACING public token reports (/r/[token])
// which have no session, so — like the company logo — they are stored as PUBLIC
// blobs and the returned public URL is persisted directly (blobSrc passes http
// URLs through unchanged). Only admins design reports, so we gate on role.
export async function POST(request: NextRequest) {
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
  if (!profile || profile.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }
    const check = validateUpload(file, { allow: IMAGE_MIME_TYPES, maxBytes: 15 * MB })
    if (!check.ok) return check.response
    const scan = await scanForMalware(file)
    if (!scan.ok) return scan.response

    const safeName = file.name.replace(/[^\w.\-]+/g, '_')
    const pathname = `report-templates/${Date.now()}-${safeName}`
    const blob = await put(pathname, file, { access: 'public', addRandomSuffix: true })

    return NextResponse.json({ url: blob.url, name: file.name })
  } catch (error) {
    console.error('[v0] Report template image upload error:', error)
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
  }
}
