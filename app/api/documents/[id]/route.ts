import { del } from '@vercel/blob'
import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getDocumentAuth } from '@/lib/documents/auth'

// Rename a document
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
    .from('documents')
    .select('owner_type')
    .eq('id', id)
    .single()
  const allowed = existing?.owner_type === 'site_engineer' ? auth.canManageEngineer : auth.canManage
  if (!allowed) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { error } = await supabase.from('documents').update({ name }).eq('id', id)
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ success: true })
}

// Delete a document (blob + metadata row)
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

  const { data: doc } = await supabase
    .from('documents')
    .select('blob_url, owner_type')
    .eq('id', id)
    .single()

  const allowed = doc?.owner_type === 'site_engineer' ? auth.canManageEngineer : auth.canManage
  if (!allowed) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  if (doc?.blob_url) {
    try {
      await del(doc.blob_url)
    } catch (error) {
      console.error('[v0] Blob delete error:', error)
    }
  }

  const { error } = await supabase.from('documents').delete().eq('id', id)
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ success: true })
}
