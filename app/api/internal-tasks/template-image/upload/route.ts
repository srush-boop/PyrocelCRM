import { put } from '@vercel/blob'
import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { validateUpload, scanForMalware, IMAGE_MIME_TYPES, MB } from '@/lib/uploads/validate'

// Uploads an author reference image attached to an internal task / form
// template block. Template authoring is restricted to quality managers
// (admin/office), so we gate on role here. The image is stored under the
// `internal-task-templates/` prefix and later streamed to every form-filler
// through the generic /api/blob proxy (blobSrc), which is why that prefix is
// allow-listed (non-staff-only) in lib/blob-access.ts.
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
  if (!profile || (profile.role !== 'admin' && profile.role !== 'office')) {
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
    const pathname = `internal-task-templates/${Date.now()}-${safeName}`
    const blob = await put(pathname, file, { access: 'private', addRandomSuffix: true })

    return NextResponse.json({ pathname: blob.pathname, name: file.name })
  } catch (error) {
    console.error('[v0] Internal task template image upload error:', error)
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
  }
}
