import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { Profile } from '@/lib/types/database'
import { generateVisitCompletionInvoice } from '@/lib/actions/visit-billing'

// Fires per-visit "invoice on completion" billing for a just-completed visit.
// Called best-effort from the task completion flow; idempotent server-side.
export async function POST(request: NextRequest) {
  try {
    // Staff-only: billing is triggered by the engineer/office completing a
    // visit. Portal clients and subcontractors must never be able to fire
    // invoice generation. The underlying action uses the RLS-bypassing admin
    // client, so authorization has to be enforced here at the route boundary.
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()
    const role = (profile as Pick<Profile, 'role'> | null)?.role
    if (role !== 'admin' && role !== 'office' && role !== 'engineer') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { taskId } = await request.json()
    if (!taskId) {
      return NextResponse.json({ error: 'Task ID required' }, { status: 400 })
    }

    const result = await generateVisitCompletionInvoice(taskId)
    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }
    return NextResponse.json({
      ok: true,
      billedCount: result.billedCount ?? 0,
      invoiceIds: result.invoiceIds ?? [],
    })
  } catch (err) {
    console.log('[v0] complete-billing route error:', (err as Error).message)
    return NextResponse.json({ error: 'Failed to process visit billing' }, { status: 500 })
  }
}
