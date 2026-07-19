import { type NextRequest, NextResponse } from 'next/server'
import { getTenderApiUser } from '@/lib/tender/access'
import { answerTenderQuestion } from '@/lib/tender/answer'
import { enforceRateLimit } from '@/lib/rate-limit'

// Generates a RAG-grounded answer for a tender question. Stateless — the client
// persists the chosen answer via PATCH /api/tender/questions/[id].
export async function POST(request: NextRequest) {
  const user = await getTenderApiUser()
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const limited = await enforceRateLimit('ai', user.id)
  if (limited) return limited

  const body = await request.json()
  const question = (body.question ?? '').trim()
  if (!question) return NextResponse.json({ error: 'A question is required' }, { status: 400 })

  const result = await answerTenderQuestion(question, {
    extraInstructions: body.extraInstructions,
  })

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 })
  return NextResponse.json(result)
}
