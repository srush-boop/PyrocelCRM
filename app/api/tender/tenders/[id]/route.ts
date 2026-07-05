import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getTenderApiUser } from '@/lib/tender/access'

const STATUSES = ['draft', 'in_progress', 'submitted', 'won', 'lost']

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
  if (typeof body.client_name === 'string') patch.client_name = body.client_name.trim() || null
  if (typeof body.reference === 'string') patch.reference = body.reference.trim() || null
  if (typeof body.notes === 'string') patch.notes = body.notes.trim() || null
  if (body.due_date !== undefined) patch.due_date = body.due_date || null
  if (STATUSES.includes(body.status)) patch.status = body.status

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('tenders')
    .update(patch)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ tender: data })
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getTenderApiUser()
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const supabase = await createClient()
  const { error } = await supabase.from('tenders').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
