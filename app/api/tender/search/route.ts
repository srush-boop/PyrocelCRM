import { type NextRequest, NextResponse } from 'next/server'
import { getTenderApiUser } from '@/lib/tender/access'
import { searchKnowledge } from '@/lib/tender/data'
import { enforceRateLimit } from '@/lib/rate-limit'

// Semantic search across all indexed company knowledge.
export async function POST(request: NextRequest) {
  const user = await getTenderApiUser()
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const limited = await enforceRateLimit('ai', user.id)
  if (limited) return limited

  const body = await request.json()
  const query = (body.query ?? '').trim()
  if (!query) return NextResponse.json({ hits: [] })

  try {
    const hits = await searchKnowledge(query)
    return NextResponse.json({ hits })
  } catch (err) {
    console.error('[v0] tender search failed:', err)
    return NextResponse.json({ error: 'Search failed' }, { status: 500 })
  }
}
