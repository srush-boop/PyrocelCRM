import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { Profile } from '@/lib/types/database'

async function requireStaff() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return {
      error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
      supabase: null,
      userId: null,
    }
  }
  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()
  const role = (profile as Profile | null)?.role
  if (role !== 'admin' && role !== 'office' && role !== 'engineer') {
    return {
      error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
      supabase: null,
      userId: null,
    }
  }
  return { error: null, supabase, userId: user.id }
}

// Add a communal internal note to a site.
export async function POST(request: NextRequest) {
  const { error, supabase, userId } = await requireStaff()
  if (error || !supabase) return error

  const body = await request.json().catch(() => ({}))
  const siteId = body.site_id as string
  const noteBody = typeof body.body === 'string' ? body.body.trim() : ''
  if (!siteId || !noteBody) {
    return NextResponse.json({ error: 'Site and note text are required.' }, { status: 400 })
  }

  const { data, error: dbError } = await supabase
    .from('site_internal_notes')
    .insert({ site_id: siteId, author_id: userId, body: noteBody })
    .select('*, author:profiles!site_internal_notes_author_id_fkey(id, full_name, role)')
    .single()

  if (dbError) {
    return NextResponse.json({ error: dbError.message }, { status: 500 })
  }
  return NextResponse.json({ note: data })
}

// Delete a note (own note, or admin/office). RLS enforces the real rule.
export async function DELETE(request: NextRequest) {
  const { error, supabase } = await requireStaff()
  if (error || !supabase) return error

  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  if (!id) {
    return NextResponse.json({ error: 'Note id required' }, { status: 400 })
  }

  const { error: dbError } = await supabase.from('site_internal_notes').delete().eq('id', id)
  if (dbError) {
    return NextResponse.json({ error: dbError.message }, { status: 500 })
  }
  return NextResponse.json({ success: true })
}
