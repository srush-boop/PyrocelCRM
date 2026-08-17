import { put } from '@vercel/blob'
import { type NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { authorizeTaskAccess } from '@/lib/subcontractor/authorize'
import { validateUpload, scanForMalware, DOCUMENT_MIME_TYPES, MB } from '@/lib/uploads/validate'

// Documents a subcontractor uploads against a specific call (quotes, photos,
// information). Stored as owner_type='task' documents so office/admin see them
// on the call in the main app. Authorization is enforced per-task in code; the
// generic /api/documents upload route is staff-only, hence this dedicated path.

export const maxDuration = 60

// List the uploads attached to a call.
export async function GET(request: NextRequest) {
  const taskId = request.nextUrl.searchParams.get('taskId')
  if (!taskId) return NextResponse.json({ error: 'Missing taskId' }, { status: 400 })

  const auth = await authorizeTaskAccess(taskId)
  if (!auth.ok) return NextResponse.json({ error: 'Forbidden' }, { status: auth.status })

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('documents')
    .select('id, name, content_type, size_bytes, description, created_at, uploaded_by')
    .eq('owner_type', 'task')
    .eq('owner_id', taskId)
    .order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ documents: data ?? [] })
}

// Upload a document against a call.
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const taskId = formData.get('task_id') as string | null
    const description = (formData.get('description') as string | null)?.trim() || null

    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    if (!taskId) return NextResponse.json({ error: 'Missing task_id' }, { status: 400 })

    const auth = await authorizeTaskAccess(taskId)
    if (!auth.ok || !auth.caller) {
      return NextResponse.json({ error: 'Forbidden' }, { status: auth.status })
    }

    const uploadCheck = validateUpload(file, { allow: DOCUMENT_MIME_TYPES, maxBytes: 25 * MB })
    if (!uploadCheck.ok) return uploadCheck.response
    const uploadScan = await scanForMalware(file)
    if (!uploadScan.ok) return uploadScan.response

    const safeName = file.name.replace(/[^\w.\-]+/g, '_')
    const pathname = `documents/task/${taskId}/${Date.now()}-${safeName}`
    const blob = await put(pathname, file, { access: 'private', addRandomSuffix: true })

    const admin = createAdminClient()
    const { data, error } = await admin
      .from('documents')
      .insert({
        owner_type: 'task',
        owner_id: taskId,
        name: file.name,
        blob_pathname: blob.pathname,
        blob_url: blob.url,
        content_type: file.type || null,
        size_bytes: file.size || null,
        uploaded_by: auth.caller.profile.id,
        description,
      })
      .select('id, name, content_type, size_bytes, description, created_at, uploaded_by')
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ document: data })
  } catch (error) {
    console.error('[v0] Subcontractor document upload error:', error)
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
  }
}
