import { put } from '@vercel/blob'
import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { validateUpload, DOCUMENT_MIME_TYPES, MB } from '@/lib/uploads/validate'

// Uploads a training certificate to private Blob storage and returns its
// pathname/url so the caller can persist them on the training record via
// saveTrainingRecord. Training data is HR-only → admin/office only.
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
  const role = (profile as { role?: string } | null)?.role
  if (!role || !['admin', 'office'].includes(role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }
    const check = validateUpload(file, { allow: DOCUMENT_MIME_TYPES, maxBytes: 25 * MB })
    if (!check.ok) return check.response

    const safeName = file.name.replace(/[^\w.\-]+/g, '_')
    const pathname = `training-certificates/${user.id}/${Date.now()}-${safeName}`

    const blob = await put(pathname, file, {
      access: 'private',
      addRandomSuffix: true,
    })

    return NextResponse.json({
      pathname: blob.pathname,
      url: blob.url,
      name: file.name,
    })
  } catch (error) {
    console.error('[v0] Training certificate upload error:', error)
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
  }
}
