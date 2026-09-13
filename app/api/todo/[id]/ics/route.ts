import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { buildTodoIcs, icsFilename } from '@/lib/todo/ics'

// Streams a single-event .ics file for a to-do so the user can add it to any
// external calendar (Outlook/Apple/Google). RLS ensures they can only fetch a
// to-do they own or are attached to.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: item } = await supabase
    .from('todo_items')
    .select('id, title, notes, due_at, all_day')
    .eq('id', id)
    .maybeSingle()

  if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!item.due_at) {
    return NextResponse.json({ error: 'This to-do has no date.' }, { status: 400 })
  }

  const ics = buildTodoIcs({
    uid: item.id,
    title: item.title,
    description: item.notes,
    start: item.due_at,
    allDay: item.all_day,
  })

  return new NextResponse(ics, {
    status: 200,
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="${icsFilename(item.title)}"`,
    },
  })
}
