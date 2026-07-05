import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getTenderApiUser } from '@/lib/tender/access'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getTenderApiUser()
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const body = await request.json()
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (typeof body.name === 'string') patch.name = body.name.trim()
  if (typeof body.prompt_text === 'string') patch.prompt_text = body.prompt_text.trim()
  if (typeof body.description === 'string') patch.description = body.description.trim() || null
  if (typeof body.category === 'string') patch.category = body.category.trim() || null
  if (typeof body.is_active === 'boolean') patch.is_active = body.is_active

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('tender_prompts')
    .update(patch)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ prompt: data })
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getTenderApiUser()
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const supabase = await createClient()
  const { error } = await supabase.from('tender_prompts').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
