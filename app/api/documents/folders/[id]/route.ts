import { del } from '@vercel/blob'
import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getDocumentAuth } from '@/lib/documents/auth'

// Rename a folder
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await getDocumentAuth()
  if (!auth.ok) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: auth.status })
  }

  const { id } = await params
  const body = await request.json().catch(() => ({}))
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  if (!name) {
    return NextResponse.json({ error: 'Name required' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data: existing } = await supabase
    .from('document_folders')
    .select('owner_type')
    .eq('id', id)
    .single()
  const allowed = existing?.owner_type === 'site_engineer' ? auth.canManageEngineer : auth.canManage
  if (!allowed) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { error } = await supabase.from('document_folders').update({ name }).eq('id', id)
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ success: true })
}

// Delete a folder and everything inside it (subfolders + files cascade in the DB;
// we also remove the underlying blobs for any contained files).
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await getDocumentAuth()
  if (!auth.ok) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: auth.status })
  }

  const { id } = await params
  const supabase = await createClient()

  const { data: rootFolder } = await supabase
    .from('document_folders')
    .select('owner_type')
    .eq('id', id)
    .single()
  const allowed =
    rootFolder?.owner_type === 'site_engineer' ? auth.canManageEngineer : auth.canManage
  if (!allowed) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Collect all descendant folder ids (recursive) so we can clean up their blobs.
  const folderIds: string[] = [id]
  let frontier: string[] = [id]
  while (frontier.length > 0) {
    const { data: children } = await supabase
      .from('document_folders')
      .select('id')
      .in('parent_id', frontier)
    const childIds = (children ?? []).map((c) => c.id as string)
    if (childIds.length === 0) break
    folderIds.push(...childIds)
    frontier = childIds
  }

  const { data: docs } = await supabase
    .from('documents')
    .select('blob_url')
    .in('folder_id', folderIds)

  for (const doc of docs ?? []) {
    if (doc.blob_url) {
      try {
        await del(doc.blob_url as string)
      } catch (error) {
        console.error('[v0] Blob delete error:', error)
      }
    }
  }

  // Deleting the root folder cascades to subfolders and document rows via FKs.
  const { error } = await supabase.from('document_folders').delete().eq('id', id)
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ success: true })
}
