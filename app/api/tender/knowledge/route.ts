import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getTenderApiUser } from '@/lib/tender/access'
import { indexSource } from '@/lib/tender/embeddings'
import { KNOWLEDGE_TYPES } from '@/lib/tender/types'

export async function POST(request: NextRequest) {
  const user = await getTenderApiUser()
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json()
  const knowledge_type = body.knowledge_type
  const title = (body.title ?? '').trim()
  const content = (body.content ?? '').trim()

  if (!KNOWLEDGE_TYPES.includes(knowledge_type)) {
    return NextResponse.json({ error: 'Invalid knowledge type' }, { status: 400 })
  }
  if (!title || !content) {
    return NextResponse.json({ error: 'Title and content are required' }, { status: 400 })
  }

  const importance = ['critical', 'high', 'normal'].includes(body.importance)
    ? body.importance
    : 'normal'
  const tags = Array.isArray(body.tags)
    ? body.tags.map((t: unknown) => String(t)).filter(Boolean)
    : []

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('tender_knowledge_items')
    .insert({
      knowledge_type,
      title,
      content,
      importance,
      tags,
      metadata: body.metadata ?? {},
      created_by: user.id,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Index for retrieval. Non-fatal if it fails; item can be re-indexed later.
  try {
    await indexSource({
      sourceType: 'knowledge',
      sourceId: data.id,
      title,
      content,
      importance,
    })
  } catch (err) {
    console.error('[v0] knowledge index failed:', err)
  }

  return NextResponse.json({ item: data })
}
