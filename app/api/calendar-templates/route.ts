import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { CalendarFilterState } from '@/lib/types/database'

// GET /api/calendar-templates — list the current user's saved filter templates.
export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('calendar_filter_templates')
    .select('*')
    .order('name')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ templates: data })
}

// POST /api/calendar-templates — create a template for the current user.
// Body: { name: string, filters: CalendarFilterState, isDefault?: boolean }
export async function POST(request: Request) {
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

  const name = body.name?.trim()
  if (!name) return NextResponse.json({ error: 'A template name is required' }, { status: 400 })

  // If this template is the new default, clear any existing default first so the
  // unique "one default per user" index is never violated.
  if (body.isDefault) {
    await supabase
      .from('calendar_filter_templates')
      .update({ is_default: false })
      .eq('user_id', user.id)
      .eq('is_default', true)
  }

  const { data, error } = await supabase
    .from('calendar_filter_templates')
    .insert({
      user_id: user.id,
      name,
      filters: body.filters ?? {},
      is_default: Boolean(body.isDefault),
    })
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ template: data }, { status: 201 })
}
