import { put } from '@vercel/blob'
import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getTenderApiUser } from '@/lib/tender/access'
import { indexVaultEntry } from '@/lib/tender/vault'
import { removeSource } from '@/lib/tender/embeddings'
import type { TenderVaultEntry, TenderVaultOutcome } from '@/lib/tender/types'

const OUTCOMES: TenderVaultOutcome[] = ['won', 'lost', 'awaiting']

// Updates a vault entry from multipart form data. Only keys present in the form
// are changed; an optional new file replaces the stored pack. Re-indexes RAG.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getTenderApiUser()
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params

  try {
    const form = await request.formData()
    const patch: Record<string, unknown> = {}

    if (form.has('title')) {
      const title = String(form.get('title') ?? '').trim()
      if (!title) return NextResponse.json({ error: 'Title is required' }, { status: 400 })
      patch.title = title
    }

    // Nullable text fields: empty string clears them.
    for (const key of [
      'client_name',
      'reference',
      'submitted_date',
      'decision_date',
      'summary',
      'winning_content',
      'client_feedback',
    ]) {
      if (form.has(key)) patch[key] = String(form.get(key) ?? '').trim() || null
    }

    if (form.has('outcome')) {
      const raw = String(form.get('outcome') ?? '')
      patch.outcome = (OUTCOMES as string[]).includes(raw) ? raw : 'awaiting'
    }

    if (form.has('contract_value')) {
      const raw = String(form.get('contract_value') ?? '').trim()
      const num = raw ? Number(raw) : null
      if (num !== null && Number.isNaN(num)) {
        return NextResponse.json({ error: 'Contract value must be a number' }, { status: 400 })
      }
      patch.contract_value = num
    }

    const file = form.get('file') as File | null
    if (file && file.size > 0) {
      const safeName = file.name.replace(/[^\w.\-]+/g, '_')
      const blob = await put(`tender-vault/${Date.now()}-${safeName}`, file, {
        access: 'private',
        addRandomSuffix: true,
      })
      patch.file_url = blob.pathname
      patch.file_name = file.name
    }

    patch.updated_at = new Date().toISOString()

    const supabase = await createClient()
    const { data, error } = await supabase
      .from('tender_vault')
      .update(patch)
      .eq('id', id)
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    try {
      await indexVaultEntry(data as TenderVaultEntry)
    } catch (indexErr) {
      console.error('[v0] vault index (update) failed:', indexErr)
    }

    return NextResponse.json({ entry: data })
  } catch (err) {
    console.error('[v0] vault update failed:', err)
    return NextResponse.json({ error: 'Could not update the tender' }, { status: 500 })
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getTenderApiUser()
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const supabase = await createClient()
  const { error } = await supabase.from('tender_vault').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Clear its RAG chunks so deleted bids stop influencing future answers.
  try {
    await removeSource('completed_tender', id)
  } catch (indexErr) {
    console.error('[v0] vault chunk cleanup failed:', indexErr)
  }

  return NextResponse.json({ ok: true })
}
