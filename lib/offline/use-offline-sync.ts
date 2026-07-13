'use client'

// Phase 0 offline spike — React glue for the offline core.
//
// Exposes connectivity + queue state to the engineer UI and auto-flushes the
// mutation queue when the device comes back online. Kept intentionally small;
// the checklist calls `persistTaskResult` directly and this hook just reflects
// state + drives the reconnect flush.

import { useCallback, useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { flushQueue, isOnline } from './sync'
import { pendingCount } from './queue'

export interface OfflineSyncState {
  online: boolean
  pending: number
  syncing: boolean
  lastSyncedAt: number | null
  /** Manually trigger a flush (also called automatically on reconnect). */
  flush: () => Promise<void>
  /** Re-read the pending count (call after enqueueing a write). */
  refresh: () => Promise<void>
}

export function useOfflineSync(): OfflineSyncState {
  const [online, setOnline] = useState(true)
  const [pending, setPending] = useState(0)
  const [syncing, setSyncing] = useState(false)
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null)
  const supabaseRef = useRef<ReturnType<typeof createClient> | null>(null)
  if (!supabaseRef.current) supabaseRef.current = createClient()

  const refresh = useCallback(async () => {
    try {
      setPending(await pendingCount())
    } catch {
      /* storage unavailable — leave count as-is */
    }
  }, [])

  const flush = useCallback(async () => {
    if (!supabaseRef.current || !isOnline()) return
    setSyncing(true)
    try {
      await flushQueue(supabaseRef.current)
      setLastSyncedAt(Date.now())
    } finally {
      setSyncing(false)
      await refresh()
    }
  }, [refresh])

  useEffect(() => {
    setOnline(isOnline())
    void refresh()

    const handleOnline = () => {
      setOnline(true)
      void flush()
    }
    const handleOffline = () => setOnline(false)

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    // Periodic reconciliation in case the browser missed an event.
    const interval = window.setInterval(() => {
      setOnline(isOnline())
      void refresh()
    }, 15000)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      window.clearInterval(interval)
    }
  }, [flush, refresh])

  return { online, pending, syncing, lastSyncedAt, flush, refresh }
}
