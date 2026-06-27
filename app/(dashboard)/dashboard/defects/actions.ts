'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import type { DefectStatus } from '@/lib/types/database'

async function requireStaff() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { supabase, ok: false as const, error: 'Not authenticated' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || !['admin', 'office'].includes(profile.role)) {
    return { supabase, ok: false as const, error: 'Not authorised' }
  }
  return { supabase, ok: true as const }
}

// Link a newly-created remedial quote to its defect and move the defect to
// 'quoted'. Called from the quote builder after a quote is saved from a defect.
export async function linkDefectToQuote(defectId: string, quoteId: string) {
  const auth = await requireStaff()
  if (!auth.ok) return { ok: false, error: auth.error }

  const { error } = await auth.supabase
    .from('defects')
    .update({ quote_id: quoteId, status: 'quoted', updated_at: new Date().toISOString() })
    .eq('id', defectId)

  if (error) return { ok: false, error: error.message }

  revalidatePath('/dashboard/defects')
  revalidatePath(`/dashboard/defects/${defectId}`)
  return { ok: true }
}

// Manually set a defect's lifecycle status (resolve / dismiss / reopen).
export async function setDefectStatus(defectId: string, status: DefectStatus) {
  const auth = await requireStaff()
  if (!auth.ok) return { ok: false, error: auth.error }

  const { error } = await auth.supabase
    .from('defects')
    .update({
      status,
      resolved_at: status === 'resolved' ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', defectId)

  if (error) return { ok: false, error: error.message }

  revalidatePath('/dashboard/defects')
  revalidatePath(`/dashboard/defects/${defectId}`)
  return { ok: true }
}
