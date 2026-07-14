import { NextRequest, NextResponse } from 'next/server'
import { generateVisitCompletionInvoice } from '@/lib/actions/visit-billing'

// Fires per-visit "invoice on completion" billing for a just-completed visit.
// Called best-effort from the task completion flow; idempotent server-side.
export async function POST(request: NextRequest) {
  try {
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
