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
 * list — there is NO success screen and NO confirmation dialog. Before leaving
 * we check for overdue / due-soon calls at other nearby sites so the worker can
 * pick them up while in the area; if any exist we show the shared
 * NearbyCallsPrompt and only navigate to Calls once it is dismissed.
 *
 * Usage:
 *   const { runExit, nearbyPrompt } = useCompletionExit(profile.role)
 *   // ...at the end of handleSubmit, after all persistence:
 *   await runExit(task.id)
 *   // ...and render {nearbyPrompt} somewhere in the tree.
 */
export function useCompletionExit(role: string) {
  const router = useRouter()
  const [nearbyCalls, setNearbyCalls] = useState<NearbyOverdueCall[]>([])
  const [showPrompt, setShowPrompt] = useState(false)

  const isWorker = role === 'engineer' || role === 'subcontractor'

  const goToCalls = useCallback(() => {
    router.push(CALLS_ROUTE)
    router.refresh()
  }, [router])

  // Run once completion persistence is done. Resolves after either navigating to
  // Calls or opening the nearby prompt (which navigates on close).
  const runExit = useCallback(
    async (fromTaskId: string) => {
      if (isWorker) {
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
    [isWorker, goToCalls],
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
