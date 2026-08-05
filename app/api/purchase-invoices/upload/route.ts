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

// Supplier invoices can be scans or photos as well as PDFs/office docs.
const ALLOWED_MIME = [...DOCUMENT_MIME_TYPES, ...IMAGE_MIME_TYPES]

export const maxDuration = 60

// Uploads one OR many supplier invoice files. Each becomes a purchase_invoices
// row in `awaiting_approval` carrying just the document fields — allocation and
// authoriser are filled in afterwards on the grid / allocation editor.
export async function POST(request: NextRequest) {
  const auth = await getDocumentAuth()
  if (!auth.ok) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: auth.status })
  }
  // Admin/office only.
  if (!auth.canManage) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const formData = await request.formData()
    const files = formData.getAll('file').filter((f): f is File => f instanceof File)
    if (files.length === 0) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    const supabase = await createClient()
    const created: unknown[] = []

    for (const file of files) {
      const uploadCheck = validateUpload(file, { allow: ALLOWED_MIME, maxBytes: 25 * MB })
      if (!uploadCheck.ok) return uploadCheck.response
      const uploadScan = await scanForMalware(file)
      if (!uploadScan.ok) return uploadScan.response

      const safeName = file.name.replace(/[^\w.\-]+/g, '_')
      const pathname = `purchase-invoices/${Date.now()}-${safeName}`
      const blob = await put(pathname, file, { access: 'private', addRandomSuffix: true })

      const { data, error } = await supabase
        .from('purchase_invoices')
        .insert({
          name: file.name,
          blob_pathname: blob.pathname,
          blob_url: blob.url,
          content_type: file.type || null,
          size_bytes: file.size || null,
          uploaded_by: auth.profile?.id ?? null,
          status: 'awaiting_approval',
        })
        .select()
        .single()

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
      created.push(data)
    }

    return NextResponse.json({ invoices: created })
  } catch (error) {
    console.error('[v0] Purchase invoice upload error:', error)
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
  }
}
