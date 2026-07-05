import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getTenderApiUser } from '@/lib/tender/access'
import { indexSource, removeSource } from '@/lib/tender/embeddings'

const STATUSES = ['unanswered', 'draft', 'final']

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getTenderApiUser()
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const body = await request.json()

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (typeof body.question === 'string') patch.question = body.question.trim()
  if (typeof body.answer === 'string') patch.answer = body.answer
  if (STATUSES.includes(body.status)) patch.status = body.status
  if (Array.isArray(body.sources)) patch.sources = body.sources
  if (typeof body.is_winning_response === 'boolean') {
    patch.is_winning_response = body.is_winning_response
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('tender_questions')
    .update(patch)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Continuous learning: a saved winning response is indexed so future answers
  // can draw on it; un-flagging removes it from retrieval.
  try {
    if (data.is_winning_response && data.answer?.trim()) {
      await indexSource({
        sourceType: 'winning_response',
        sourceId: data.id,
        title: `Winning response: ${data.question}`.slice(0, 200),
        content: `Q: ${data.question}\n\nA: ${data.answer}`,
        importance: 'high',
      })
    } else {
      await removeSource('winning_response', data.id)
    }
  } catch (err) {
    console.error('[v0] winning response index failed:', err)
  }

  return NextResponse.json({ question: data })
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getTenderApiUser()
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const supabase = await createClient()
  const { error } = await supabase.from('tender_questions').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  try {
    await removeSource('winning_response', id)
  } catch (err) {
    console.error('[v0] question chunk cleanup failed:', err)
  }

  return NextResponse.json({ ok: true })
}
