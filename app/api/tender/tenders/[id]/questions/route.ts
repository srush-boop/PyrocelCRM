import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getTenderApiUser } from '@/lib/tender/access'

// Adds a question to a tender. Answering is a separate step (POST /answer).
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getTenderApiUser()
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id: tenderId } = await params
  const body = await request.json()
  const question = (body.question ?? '').trim()
  if (!question) return NextResponse.json({ error: 'Question is required' }, { status: 400 })

  const supabase = await createClient()

  // Place new questions at the end.
  const { count } = await supabase
    .from('tender_questions')
    .select('id', { count: 'exact', head: true })
    .eq('tender_id', tenderId)

  const { data, error } = await supabase
    .from('tender_questions')
    .insert({
      tender_id: tenderId,
      question,
      sort_order: count ?? 0,
      created_by: user.id,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ question: data })
}
