import { put } from '@vercel/blob'
import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { validateUpload, scanForMalware, DOCUMENT_MIME_TYPES, MB } from '@/lib/uploads/validate'

// Uploads a photo for an internal-task instance the caller owns. RLS on
// internal_task_attachments enforces that the instance belongs to the uploader
// (or that they are a quality manager), so we rely on the user-scoped client
// rather than a role gate — this route is available to every signed-in user
// (engineers, office, admin, sub-contractors), unlike the staff-only task
// attachment route.
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const instanceId = formData.get('instance_id') as string | null
    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }
    const check = validateUpload(file, { allow: DOCUMENT_MIME_TYPES, maxBytes: 25 * MB })
    if (!check.ok) return check.response
    const scan = await scanForMalware(file)
    if (!scan.ok) return scan.response
    if (!instanceId) {
      return NextResponse.json({ error: 'Missing instance_id' }, { status: 400 })
    }

    const safeName = file.name.replace(/[^\w.\-]+/g, '_')
    const pathname = `internal-task-attachments/${instanceId}/${Date.now()}-${safeName}`
    const blob = await put(pathname, file, { access: 'private', addRandomSuffix: true })

    // RLS rejects the insert if the instance is not the caller's own.
    const { data, error } = await supabase
      .from('internal_task_attachments')
      .insert({
        instance_id: instanceId,
        name: file.name,
        blob_pathname: blob.pathname,
        blob_url: blob.url,
        content_type: file.type || null,
        size_bytes: file.size || null,
        uploaded_by: user.id,
      })
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ attachment: data })
  } catch (error) {
    console.error('[v0] Internal task attachment upload error:', error)
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
  }
}
