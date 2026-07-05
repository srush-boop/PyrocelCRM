import { put } from '@vercel/blob'
import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getTenderApiUser } from '@/lib/tender/access'
import { extractTenderQuestions } from '@/lib/tender/extract-questions'

// Reading a PDF/Word pack + one structured model call can take a while.
export const maxDuration = 120

// Accepts multipart form data with a `file` (the client tender pack). Stores the
// pack privately in Blob, extracts every answerable question via the AI, and
// bulk-inserts them into tender_questions. Drafting answers is a separate,
// client-driven step so progress can be shown per question.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getTenderApiUser()
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id: tenderId } = await params

  let file: File | null = null
  try {
    const form = await request.formData()
    file = form.get('file') as File | null
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 })
  }

  if (!file || file.size === 0) {
    return NextResponse.json({ error: 'A tender pack file is required' }, { status: 400 })
  }

  const supabase = await createClient()

  // Confirm the tender exists (and is visible to this staff user via RLS).
  const { data: tender, error: tenderErr } = await supabase
    .from('tenders')
    .select('id')
    .eq('id', tenderId)
    .maybeSingle()
  if (tenderErr || !tender) {
    return NextResponse.json({ error: 'Tender not found' }, { status: 404 })
  }

  // Extract questions before storing so a parse/AI failure returns a clean error.
  const extraction = await extractTenderQuestions(file)
  if (!extraction.ok) {
    return NextResponse.json({ error: extraction.error }, { status: 400 })
  }
  const extracted = extraction.questions ?? []

  // Store the original pack privately so it can be re-opened later. Non-fatal.
  try {
    const safeName = file.name.replace(/[^\w.\-]+/g, '_')
    const blob = await put(`tender-packs/${tenderId}/${safeName}`, file, {
      access: 'private',
      addRandomSuffix: true,
    })
    await supabase
      .from('tenders')
      .update({ pack_file_url: blob.pathname, pack_file_name: file.name })
      .eq('id', tenderId)
  } catch (err) {
    console.error('[v0] tender pack blob upload failed (continuing):', err)
  }

  if (extracted.length === 0) {
    return NextResponse.json({ questions: [], message: 'No answerable questions were found in that document.' })
  }

  // Place extracted questions after any existing ones.
  const { count } = await supabase
    .from('tender_questions')
    .select('id', { count: 'exact', head: true })
    .eq('tender_id', tenderId)

  const startOrder = count ?? 0
  const rows = extracted.map((question, i) => ({
    tender_id: tenderId,
    question,
    sort_order: startOrder + i,
    created_by: user.id,
  }))

  const { data, error } = await supabase.from('tender_questions').insert(rows).select()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ questions: data ?? [] })
}
