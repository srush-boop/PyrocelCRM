import { put } from '@vercel/blob'
import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getDocumentAuth } from '@/lib/documents/auth'
import { validateUpload, DOCUMENT_MIME_TYPES, MB } from '@/lib/uploads/validate'

// Any staff member (admin/office/engineer) may attach files to a call.
export async function POST(request: NextRequest) {
  const auth = await getDocumentAuth()
  if (!auth.ok) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: auth.status })
  }

  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const taskId = formData.get('task_id') as string | null

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }
    const check = validateUpload(file, { allow: DOCUMENT_MIME_TYPES, maxBytes: 25 * MB })
    if (!check.ok) return check.response
    if (!taskId) {
      return NextResponse.json({ error: 'Missing task_id' }, { status: 400 })
    }

    // Namespaced path keeps blobs organised and avoids collisions.
    const safeName = file.name.replace(/[^\w.\-]+/g, '_')
    const pathname = `task-attachments/${taskId}/${Date.now()}-${safeName}`

    const blob = await put(pathname, file, {
      access: 'private',
      addRandomSuffix: true,
    })

    const supabase = await createClient()
    const { data, error } = await supabase
      .from('task_attachments')
      .insert({
        task_id: taskId,
        name: file.name,
        blob_pathname: blob.pathname,
        blob_url: blob.url,
        content_type: file.type || null,
        size_bytes: file.size || null,
        uploaded_by: auth.profile?.id ?? null,
      })
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ attachment: data })
  } catch (error) {
    console.error('[v0] Task attachment upload error:', error)
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
  }
}
