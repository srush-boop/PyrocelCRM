import { del } from '@vercel/blob'
import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getDocumentAuth } from '@/lib/documents/auth'

// Deletes a vault document (row + underlying blob). ADMIN ONLY.
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const auth = await getDocumentAuth()
  if (!auth.ok) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: auth.status })
  }
  if (auth.profile?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const supabase = await createClient()
  const { data: doc, error: fetchErr } = await supabase
    .from('vault_documents')
    .select('id, blob_pathname')
    .eq('id', id)
    .single()
  if (fetchErr || !doc) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // Remove the row first (RLS-checked); best-effort blob cleanup afterwards.
  const { error: delErr } = await supabase.from('vault_documents').delete().eq('id', id)
  if (delErr) {
    return NextResponse.json({ error: delErr.message }, { status: 500 })
  }

  try {
    if (doc.blob_pathname) await del(doc.blob_pathname)
  } catch (err) {
    console.error('[v0] Vault blob delete failed (row already removed):', err)
  }

  return NextResponse.json({ ok: true })
}
