'use client'

// Phase 0 offline spike — compact connectivity/sync indicator for the checklist.
// Shows: offline with N queued change(s) / syncing / all saved.

import { CloudOff, RefreshCw, CheckCircle2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { OfflineSyncState } from '@/lib/offline/use-offline-sync'

export function OfflineStatusBadge({ state }: { state: OfflineSyncState }) {
  const { online, pending, syncing } = state

  // When online with nothing queued and not mid-sync, stay quiet unless a sync
  // just happened, to avoid nagging during normal connected use.
  if (online && pending === 0 && !syncing) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
        All changes saved
      </span>
    )
  }

  if (syncing) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
        <RefreshCw className="h-3.5 w-3.5 animate-spin" />
        Syncing{pending > 0 ? ` ${pending} change${pending === 1 ? '' : 's'}` : ''}…
      </span>
    )
  }

  if (!online) {
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium',
          'bg-amber-100 text-amber-900',
        )}
        role="status"
      >
        <CloudOff className="h-3.5 w-3.5" />
        {pending > 0
          ? `Offline — ${pending} change${pending === 1 ? '' : 's'} saved on device`
          : 'Offline — changes will save on this device'}
      </span>
    )
  }

  // Online but with a residual pending count (flush pending/failed).
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <RefreshCw className="h-3.5 w-3.5" />
      {pending} change{pending === 1 ? '' : 's'} pending sync
    </span>
  )
}
