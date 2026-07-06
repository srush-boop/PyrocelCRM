import { put } from '@vercel/blob'
import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getDocumentAuth } from '@/lib/documents/auth'
import { extractDocumentText } from '@/lib/ai/parse-document'
import type { DocumentOwnerType } from '@/lib/types/database'

const OWNER_TYPES: DocumentOwnerType[] = [
  'client',
  'site',
  'site_service',
  'site_engineer',
  'system_reference',
]

// PDF text extraction for system references can take a little while.
export const maxDuration = 60

export async function POST(request: NextRequest) {
  const auth = await getDocumentAuth()
  if (!auth.ok) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: auth.status })
  }

  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const ownerType = formData.get('owner_type') as DocumentOwnerType | null
    const ownerId = formData.get('owner_id') as string | null
    const folderIdRaw = formData.get('folder_id') as string | null
    const folderId = folderIdRaw && folderIdRaw !== 'null' ? folderIdRaw : null
    const isSystemReference = ownerType === 'system_reference'
    const description = (formData.get('description') as string | null)?.trim() || null
    const systemTypeIdRaw = (formData.get('system_type_id') as string | null)?.trim()
    const systemTypeId = systemTypeIdRaw && systemTypeIdRaw !== 'null' ? systemTypeIdRaw : null

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }
    if (!ownerType || !OWNER_TYPES.includes(ownerType) || !ownerId) {
      return NextResponse.json({ error: 'Invalid owner' }, { status: 400 })
    }

    // Permission by store: engineers -> shared engineer folder only;
    // system references -> admin only; everything else -> canManage (admin/office).
    let allowed: boolean
    if (isSystemReference) {
      allowed = auth.profile?.role === 'admin'
    } else if (ownerType === 'site_engineer') {
      allowed = auth.canManageEngineer
    } else {
      allowed = auth.canManage
    }
    if (!allowed) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    if (isSystemReference && !systemTypeId) {
      return NextResponse.json({ error: 'Please choose a system.' }, { status: 400 })
    }

    // System references get their text extracted up-front for AI grounding.
    let extractedText: string | null = null
    if (isSystemReference) {
      const result = await extractDocumentText(file)
      if (result.ok && result.text) extractedText = result.text
    }

    // Namespaced path keeps blobs organised and avoids collisions.
    const safeName = file.name.replace(/[^\w.\-]+/g, '_')
    const pathname = `documents/${ownerType}/${ownerId}/${Date.now()}-${safeName}`

    const blob = await put(pathname, file, {
      access: 'private',
      addRandomSuffix: true,
    })

    const supabase = await createClient()
    const { data, error } = await supabase
      .from('documents')
      .insert({
        owner_type: ownerType,
        owner_id: ownerId,
        folder_id: folderId,
        name: file.name,
        blob_pathname: blob.pathname,
        blob_url: blob.url,
        content_type: file.type || null,
        size_bytes: file.size || null,
        uploaded_by: auth.profile?.id ?? null,
        description,
        system_type_id: systemTypeId,
        extracted_text: extractedText,
      })
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ document: data })
  } catch (error) {
    console.error('[v0] Document upload error:', error)
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
  }
}
