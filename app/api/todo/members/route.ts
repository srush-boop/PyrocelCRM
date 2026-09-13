import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Lists active internal users for the to-do assignment / invite picker.
export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data } = await supabase
    .from('profiles')
    .select('id, full_name, email, role')
    .eq('status', 'active')
    .order('full_name', { ascending: true })

  const members = (data ?? []).filter((m) => m.id !== user.id)
  return NextResponse.json({ members })
}
