import { put } from '@vercel/blob'
import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { scanForMalware } from '@/lib/uploads/validate'
import type { TodoAttachmentKind } from '@/lib/types/database'

// Attach a FILE or EMAIL to a to-do. The Blob store is private, so we store the
// object pathname and stream bytes back through /api/todo/attachment/[id].
// RLS on todo_attachments enforces that the caller may act on this item, so we
// let the insert be the authorization gate rather than re-checking here.

const MB = 1024 * 1024
const MAX_BYTES = 25 * MB

// Regular file types (documents + images).
const FILE_MIME = new Set<string>([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/heif',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
  'text/csv',
])

// Email container types. .msg often reports an empty or octet-stream MIME, so we
// also detect emails by file extension below.
const EMAIL_MIME = new Set<string>(['message/rfc822', 'application/vnd.ms-outlook'])

function isEmailFile(name: string, type: string): boolean {
  const lower = name.toLowerCase()
  return EMAIL_MIME.has(type) || lower.endsWith('.eml') || lower.endsWith('.msg')
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: itemId } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised.' }, { status: 401 })

  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    if (!file || file.size === 0) {
      return NextResponse.json({ error: 'No file provided.' }, { status: 400 })
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { error: 'File is too large. Maximum size is 25MB.' },
        { status: 413 },
      )
    }

    const email = isEmailFile(file.name, file.type)
    if (!email && !FILE_MIME.has(file.type)) {
      return NextResponse.json({ error: 'Unsupported file type.' }, { status: 415 })
    }

    const scan = await scanForMalware(file)
    if (!scan.ok) return scan.response

    const safeName = file.name.replace(/[^\w.\-]+/g, '_') || (email ? 'email.eml' : 'file')
    const blob = await put(`todo/${itemId}/${safeName}`, file, {
      access: 'private',
      addRandomSuffix: true,
    })

    const kind: TodoAttachmentKind = email ? 'email' : 'file'
    const { data, error } = await supabase
      .from('todo_attachments')
      .insert({
        item_id: itemId,
        uploaded_by: user.id,
        kind,
        file_name: file.name,
        content_type: file.type || null,
        size_bytes: file.size,
        blob_path: blob.pathname,
      })
      .select('*')
      .single()

    if (error) {
      // RLS rejection (not permitted on this item) or any DB failure — clean up
      // the orphaned blob so we don't leak storage.
      const { del } = await import('@vercel/blob')
      await del(blob.pathname).catch(() => {})
      return NextResponse.json({ error: error.message }, { status: 403 })
    }

    return NextResponse.json({ attachment: data })
  } catch (err) {
    console.error('[v0] todo attachment upload error:', err)
    return NextResponse.json({ error: 'Upload failed.' }, { status: 500 })
  }
}
