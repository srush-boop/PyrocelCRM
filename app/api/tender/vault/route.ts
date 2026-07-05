import { put } from '@vercel/blob'
import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getTenderApiUser } from '@/lib/tender/access'
import { indexVaultEntry } from '@/lib/tender/vault'
import type { TenderVaultEntry, TenderVaultOutcome } from '@/lib/tender/types'

const OUTCOMES: TenderVaultOutcome[] = ['won', 'lost', 'awaiting']

function parseOutcome(raw: string): TenderVaultOutcome {
  return (OUTCOMES as string[]).includes(raw) ? (raw as TenderVaultOutcome) : 'awaiting'
}

// Accepts multipart form data for a completed tender: title, client_name,
// reference, outcome, submitted_date, decision_date, contract_value, summary,
// winning_content, client_feedback, and an optional completed pack file.
export async function POST(request: NextRequest) {
  const user = await getTenderApiUser()
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  try {
    const form = await request.formData()
    const title = String(form.get('title') ?? '').trim()
    if (!title) return NextResponse.json({ error: 'Title is required' }, { status: 400 })

    const text = (key: string) => String(form.get(key) ?? '').trim() || null
    const contractRaw = String(form.get('contract_value') ?? '').trim()
    const contract_value = contractRaw ? Number(contractRaw) : null
    if (contract_value !== null && Number.isNaN(contract_value)) {
      return NextResponse.json({ error: 'Contract value must be a number' }, { status: 400 })
    }

    const file = form.get('file') as File | null
    let file_url: string | null = null
    let file_name: string | null = null

    if (file && file.size > 0) {
      const safeName = file.name.replace(/[^\w.\-]+/g, '_')
      const blob = await put(`tender-vault/${Date.now()}-${safeName}`, file, {
        access: 'private',
        addRandomSuffix: true,
      })
      file_url = blob.pathname
      file_name = file.name
    }

    const supabase = await createClient()
    const { data, error } = await supabase
      .from('tender_vault')
      .insert({
        title,
        client_name: text('client_name'),
        reference: text('reference'),
        outcome: parseOutcome(String(form.get('outcome') ?? 'awaiting')),
        submitted_date: text('submitted_date'),
        decision_date: text('decision_date'),
        contract_value,
        summary: text('summary'),
        winning_content: text('winning_content'),
        client_feedback: text('client_feedback'),
        file_url,
        file_name,
        created_by: user.id,
      })
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Index into the shared RAG store so the AI can learn from this bid. Never
    // let an indexing hiccup fail the save — it can be re-indexed on edit.
    try {
      await indexVaultEntry(data as TenderVaultEntry)
    } catch (indexErr) {
      console.error('[v0] vault index (create) failed:', indexErr)
    }

    return NextResponse.json({ entry: data })
  } catch (err) {
    console.error('[v0] vault create failed:', err)
    return NextResponse.json({ error: 'Could not save the tender' }, { status: 500 })
  }
}
