import { put } from '@vercel/blob'
import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getDocumentAuth } from '@/lib/documents/auth'
import {
  validateUpload,
  scanForMalware,
  DOCUMENT_MIME_TYPES,
  IMAGE_MIME_TYPES,
  MB,
} from '@/lib/uploads/validate'

// Vault documentation can be PDFs, office docs, plain text or scans/photos.
const ALLOWED_MIME = [...DOCUMENT_MIME_TYPES, ...IMAGE_MIME_TYPES]

export const maxDuration = 60

// Uploads one or many documentation files into a vault folder. ADMIN ONLY —
// folder writes are gated to admins both here and by RLS. Each file becomes a
// vault_documents row streamed later through /api/vault/documents/[id]/file.
export async function POST(request: NextRequest) {
  const auth = await getDocumentAuth()
  if (!auth.ok) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: auth.status })
  }
  // Only admins may upload to vault folders.
  if (auth.profile?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const formData = await request.formData()
    const folderId = formData.get('folder_id')
    if (typeof folderId !== 'string' || !folderId) {
      return NextResponse.json({ error: 'Missing folder' }, { status: 400 })
    }
    const files = formData.getAll('file').filter((f): f is File => f instanceof File)
    if (files.length === 0) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    const supabase = await createClient()

    // Confirm the target folder exists (RLS also enforces admin visibility).
    const { data: folder, error: folderErr } = await supabase
      .from('vault_folders')
      .select('id')
      .eq('id', folderId)
      .single()
    if (folderErr || !folder) {
      return NextResponse.json({ error: 'Folder not found' }, { status: 404 })
    }

    const created: unknown[] = []

    for (const file of files) {
      const uploadCheck = validateUpload(file, { allow: ALLOWED_MIME, maxBytes: 25 * MB })
      if (!uploadCheck.ok) return uploadCheck.response
      const uploadScan = await scanForMalware(file)
      if (!uploadScan.ok) return uploadScan.response

      const safeName = file.name.replace(/[^\w.\-]+/g, '_')
      const pathname = `vault/${folderId}/${Date.now()}-${safeName}`
      const blob = await put(pathname, file, { access: 'private', addRandomSuffix: true })

      const { data, error } = await supabase
        .from('vault_documents')
        .insert({
          folder_id: folderId,
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
      created.push(data)
    }

    return NextResponse.json({ documents: created })
  } catch (error) {
    console.error('[v0] Vault document upload error:', error)
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
  }
}
