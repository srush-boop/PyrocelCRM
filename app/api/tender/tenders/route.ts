import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getTenderApiUser } from '@/lib/tender/access'

export async function POST(request: NextRequest) {
  const user = await getTenderApiUser()
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json()
  const title = (body.title ?? '').trim()
  if (!title) return NextResponse.json({ error: 'Title is required' }, { status: 400 })

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('tenders')
    .insert({
      title,
      client_name: body.client_name?.trim() || null,
      reference: body.reference?.trim() || null,
      due_date: body.due_date || null,
      notes: body.notes?.trim() || null,
      created_by: user.id,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ tender: data })
}
