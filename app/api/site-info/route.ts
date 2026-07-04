import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { Profile } from '@/lib/types/database'

// Boolean flag columns shared by sites and site_services.
const BOOL_FLAGS = [
  'booking_required',
  'access_required',
  'keys_required',
  'two_engineers_required',
  'remedial_required',
] as const

/** Ensure caller is staff (admin/office/engineer). Returns the profile or an error. */
async function requireStaff() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }), supabase: null }
  }
  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()
  const role = (profile as Profile | null)?.role
  if (role !== 'admin' && role !== 'office' && role !== 'engineer') {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }), supabase: null }
  }
  return { error: null, supabase }
}

/**
 * Update the pre-attendance flags for a site (`target: 'site'`) or a specific
 * service (`target: 'service'`). For services, a flag value of `null` means
 * "inherit from site". All staff (including engineers) may contribute.
 */
export async function PATCH(request: NextRequest) {
  const { error, supabase } = await requireStaff()
  if (error || !supabase) return error

  const body = await request.json().catch(() => ({}))
  const target = body.target as 'site' | 'service'
  const id = body.id as string
  if (!id || (target !== 'site' && target !== 'service')) {
    return NextResponse.json({ error: 'Invalid target' }, { status: 400 })
  }

  const update: Record<string, boolean | string | null> = {}
  for (const key of BOOL_FLAGS) {
    if (key in body) {
      const val = body[key]
      if (target === 'service') {
        // Services allow tri-state: true / false / null (inherit).
        update[key] = val === null ? null : Boolean(val)
      } else {
        update[key] = Boolean(val)
      }
    }
  }
  if ('remedial_notes' in body) {
    const note = body.remedial_notes
    update.remedial_notes = typeof note === 'string' && note.trim() ? note.trim() : null
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
  }

  const table = target === 'site' ? 'sites' : 'site_services'
  const { error: dbError } = await supabase.from(table).update(update).eq('id', id)
  if (dbError) {
    return NextResponse.json({ error: dbError.message }, { status: 500 })
  }
  return NextResponse.json({ success: true })
}
