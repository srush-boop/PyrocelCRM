import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { CalendarFilterState } from '@/lib/types/database'

// PATCH /api/calendar-templates/[id] — rename, update filters, or set as default.
// Body: { name?: string, filters?: CalendarFilterState, isDefault?: boolean }
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { name?: string; filters?: CalendarFilterState; isDefault?: boolean }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (typeof body.name === 'string') {
    const name = body.name.trim()
    if (!name) return NextResponse.json({ error: 'Name cannot be empty' }, { status: 400 })
    patch.name = name
  }
  if (body.filters !== undefined) patch.filters = body.filters

  // Promoting to default: clear the previous default first (RLS scopes to the user).
  if (body.isDefault === true) {
    await supabase
      .from('calendar_filter_templates')
      .update({ is_default: false })
      .eq('user_id', user.id)
      .eq('is_default', true)
    patch.is_default = true
  } else if (body.isDefault === false) {
    patch.is_default = false
  }

  const { data, error } = await supabase
    .from('calendar_filter_templates')
    .update(patch)
    .eq('id', id)
    .eq('user_id', user.id)
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ template: data })
}

// DELETE /api/calendar-templates/[id] — remove one of the user's templates.
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { error } = await supabase
    .from('calendar_filter_templates')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
