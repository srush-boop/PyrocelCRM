import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getTenderApiUser } from '@/lib/tender/access'

export async function POST(request: NextRequest) {
  const user = await getTenderApiUser()
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json()
  const name = (body.name ?? '').trim()
  const prompt_text = (body.prompt_text ?? '').trim()
  if (!name || !prompt_text) {
    return NextResponse.json({ error: 'Name and prompt text are required' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('tender_prompts')
    .insert({
      name,
      prompt_text,
      description: body.description?.trim() || null,
      category: body.category?.trim() || null,
      created_by: user.id,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ prompt: data })
}
