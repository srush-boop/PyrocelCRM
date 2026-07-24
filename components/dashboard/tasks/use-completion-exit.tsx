'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { NearbyCallsPrompt } from '@/components/dashboard/tasks/nearby-calls-prompt'
import {
  findNearbyOverdueCalls,
  type NearbyOverdueCall,
} from '@/app/(dashboard)/dashboard/nearby/actions'

const CALLS_ROUTE = '/dashboard/schedule'

/**
 * Shared post-completion behaviour for every task-execution flow (generic +
 * the four asset flows: dampers, MCPs, emergency lights, extinguishers).
 *
 * On completion the engineer/sub-contractor is returned straight to the Calls
 * list — there is NO success screen and NO confirmation dialog. For internal
 * engineers only, before leaving we check for overdue / due-soon calls at other
 * nearby sites so they can pick them up while in the area; if any exist we show
 * the shared NearbyCallsPrompt and only navigate to Calls once it is dismissed.
 * Sub-contractors are external and never offered other companies'/engineers'
 * nearby calls — they go straight back to their own Calls list. CDO engineers
 * (discipline 'cdo') run planned routes rather than opportunistic nearby work,
 * so they are not offered nearby calls either.
 *
 * Usage:
 *   const { runExit, nearbyPrompt } = useCompletionExit(profile.role, profile.discipline)
 *   // ...at the end of handleSubmit, after all persistence:
 *   await runExit(task.id, nextRouteTaskId)
 *   // ...and render {nearbyPrompt} somewhere in the tree.
 *
 * When the completed call is part of a CDO route, pass the next call's id as
 * `nextRouteTaskId`: the engineer is taken straight to that call so they can
 * work the route without returning to the list. When there is no next call
 * (last on the route) they fall back to Calls as normal.
 */
export function useCompletionExit(role: string, discipline?: string | null) {
  const router = useRouter()
  const [nearbyCalls, setNearbyCalls] = useState<NearbyOverdueCall[]>([])
  const [showPrompt, setShowPrompt] = useState(false)

  // Only internal engineers are offered nearby overdue calls; sub-contractors
  // return straight to their own Calls list, and CDO engineers work planned
  // routes so they are excluded too.
  const offerNearby = role === 'engineer' && discipline !== 'cdo'

  const goToCalls = useCallback(() => {
    router.push(CALLS_ROUTE)
    router.refresh()
  }, [router])

  // Run once completion persistence is done. Resolves after either navigating to
  // Calls, the next call on the route, or the nearby prompt (which navigates on
  // close).
  const runExit = useCallback(
    async (fromTaskId: string, nextRouteTaskId?: string | null) => {
      // On a route: go straight to the next pending call in route order.
      if (nextRouteTaskId) {
        router.push(`/dashboard/tasks/${nextRouteTaskId}`)
        router.refresh()
        return
      }
      if (offerNearby) {
        try {
          const res = await findNearbyOverdueCalls({ fromTaskId })
          if (res.ok && res.calls && res.calls.length > 0) {
            setNearbyCalls(res.calls)
            setShowPrompt(true)
            return
          }
        } catch (err) {
          console.error('[v0] Nearby calls lookup failed:', err)
        }
      }
      goToCalls()
    },
    [offerNearby, goToCalls, router],
  )

  const handleClose = useCallback(() => {
    setShowPrompt(false)
    goToCalls()
  }, [goToCalls])

  const nearbyPrompt = (
    <NearbyCallsPrompt open={showPrompt} calls={nearbyCalls} onClose={handleClose} />
  )

  return { runExit, nearbyPrompt }
}
