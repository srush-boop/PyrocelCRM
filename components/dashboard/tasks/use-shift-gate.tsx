'use client'

import { useCallback, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { mustStartShiftBeforeWork } from '@/app/(dashboard)/dashboard/lone-worker/actions'

/**
 * Enforces that a lone-worker engineer has started their safety shift before
 * they can begin a call. Shared by every call-type execution screen.
 *
 * Usage:
 *   const { ensureOnShift, checking, shiftGateDialog } = useShiftGate()
 *   const handleStart = async () => {
 *     if (!(await ensureOnShift())) return
 *     // ...proceed to mark the task in_progress
 *   }
 *   // render {shiftGateDialog} somewhere in the tree
 *
 * `ensureOnShift` resolves true when the engineer may proceed. When they must
 * start a shift first it opens a blocking dialog and resolves false. Office,
 * admin and non-eligible users are never gated (the server action returns false).
 */
export function useShiftGate() {
  const [open, setOpen] = useState(false)
  const [checking, setChecking] = useState(false)
  const router = useRouter()

  const ensureOnShift = useCallback(async (): Promise<boolean> => {
    setChecking(true)
    try {
      if (await mustStartShiftBeforeWork()) {
        setOpen(true)
        return false
      }
      return true
    } catch {
      // If the check itself fails, don't hard-block the engineer's work.
      return true
    } finally {
      setChecking(false)
    }
  }, [])

  const shiftGateDialog = (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Start your shift first</AlertDialogTitle>
          <AlertDialogDescription>
            For your safety, you need to start your lone worker shift before beginning a call so your
            check-ins are active. Go to your home screen and tap &quot;Start shift&quot;, then come
            back to begin.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={() => router.push('/dashboard')}>Go to home</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )

  return { ensureOnShift, checking, shiftGateDialog }
}
