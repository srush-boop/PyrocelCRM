import { NextRequest, NextResponse } from 'next/server'
import { requireLabourCostViewer } from '@/lib/auth/labour-costs'
import { getCallProfit } from '@/lib/billing/call-profit-data'

/**
 * Batch per-call profitability for the reports grid. Permission-gated: returns
 * 403 for anyone who may not view labour costs, so the cost numbers never reach
 * the client for unauthorised users (the grid simply omits the column).
 *
 * POST { taskIds: string[] } → { margins: Record<taskId, { costPence, revenuePence,
 *   profitPence, marginPct, revenueSource }> }
 */
export async function POST(req: NextRequest) {
  const access = await requireLabourCostViewer()
  if (!access) {
    return NextResponse.json({ error: 'Forbidden.' }, { status: 403 })
  }

  let taskIds: string[] = []
  try {
    const body = await req.json()
    taskIds = Array.isArray(body?.taskIds) ? body.taskIds.filter((t: unknown) => typeof t === 'string') : []
  } catch {
    return NextResponse.json({ error: 'Invalid body.' }, { status: 400 })
  }

  // Cap the batch so a single request can't fan out unboundedly.
  const capped = taskIds.slice(0, 200)

  const entries = await Promise.all(
    capped.map(async (taskId) => {
      const profit = await getCallProfit(taskId)
      if (!profit) return null
      return [
        taskId,
        {
          costPence: profit.costPence,
          revenuePence: profit.revenuePence,
          profitPence: profit.profitPence,
          marginPct: profit.marginPct,
          revenueSource: profit.revenueSource,
        },
      ] as const
    }),
  )

  const margins = Object.fromEntries(entries.filter((e): e is NonNullable<typeof e> => e !== null))
  return NextResponse.json({ authorised: true, margins })
}
