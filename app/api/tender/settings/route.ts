import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getTenderApiUser } from '@/lib/tender/access'

// Upserts the single tender settings row (tone + default instructions).
export async function PATCH(request: NextRequest) {
  const user = await getTenderApiUser()
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json()
  const supabase = await createClient()

  const { data: existing } = await supabase
    .from('tender_settings')
    .select('id')
    .limit(1)
    .maybeSingle()

  const values: Record<string, unknown> = {
    updated_by: user.id,
    updated_at: new Date().toISOString(),
  }
  if (typeof body.company_tone === 'string') values.company_tone = body.company_tone.trim()
  if (typeof body.default_instructions === 'string') {
    values.default_instructions = body.default_instructions.trim() || null
  }

  const query = existing
    ? supabase.from('tender_settings').update(values).eq('id', existing.id)
    : supabase.from('tender_settings').insert(values)

  const { data, error } = await query.select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ settings: data })
}
