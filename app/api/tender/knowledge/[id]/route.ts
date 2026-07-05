import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getTenderApiUser } from '@/lib/tender/access'
import { indexSource, removeSource } from '@/lib/tender/embeddings'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getTenderApiUser()
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const body = await request.json()

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (typeof body.title === 'string') patch.title = body.title.trim()
  if (typeof body.content === 'string') patch.content = body.content.trim()
  if (['critical', 'high', 'normal'].includes(body.importance)) patch.importance = body.importance
  if (typeof body.is_active === 'boolean') patch.is_active = body.is_active
  if (Array.isArray(body.tags)) patch.tags = body.tags.map((t: unknown) => String(t)).filter(Boolean)

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('tender_knowledge_items')
    .update(patch)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Keep the vector index in sync: deactivated items are removed from search,
  // active ones are re-embedded from the latest content.
  try {
    if (data.is_active) {
      await indexSource({
        sourceType: 'knowledge',
        sourceId: data.id,
        title: data.title,
        content: data.content,
        importance: data.importance,
      })
    } else {
      await removeSource('knowledge', data.id)
    }
  } catch (err) {
    console.error('[v0] knowledge re-index failed:', err)
  }

  return NextResponse.json({ item: data })
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getTenderApiUser()
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const supabase = await createClient()
  const { error } = await supabase.from('tender_knowledge_items').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  try {
    await removeSource('knowledge', id)
  } catch (err) {
    console.error('[v0] knowledge chunk cleanup failed:', err)
  }

  return NextResponse.json({ ok: true })
}
