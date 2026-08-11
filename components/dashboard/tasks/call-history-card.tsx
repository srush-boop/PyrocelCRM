'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { History, CalendarIcon, ChevronDown } from 'lucide-react'
import { formatDateUK } from '@/lib/utils'
import { CallResultBadge, CallStatusBadge } from '@/components/dashboard/calls/call-tile'

// A single prior call shown in the history list. `type` is the pre-composed
// "Service · Visit type" label; `date` is the completion date for completed
// calls, otherwise the scheduled date.
export interface CallHistoryEntry {
  id: string
  type: string
  date: string | null
  status: string
  result: string | null
  reference: string | null
}

/**
 * Read-only "History" panel shown at the top of a call. Lists the last few
 * calls logged against the same system so the engineer has recent context
 * (call type, date, and result) before starting. Renders nothing when there is
 * no prior history. Each row links through to that call.
 */
export function CallHistoryCard({
  systemName,
  entries,
}: {
  systemName: string | null
  entries: CallHistoryEntry[]
}) {
  // Collapsed by default — history is reference context, shown at the very
  // bottom of the call view below the completion action.
  const [open, setOpen] = useState(false)

  if (entries.length === 0) return null

  return (
    <Card>
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="flex w-full items-center justify-between gap-2 rounded-t-xl px-6 py-4 text-left transition-colors hover:bg-accent/40"
          >
            <CardTitle className="flex items-center gap-2 text-base">
              <History className="h-4 w-4 text-muted-foreground" />
              <span className="text-pretty">
                History{systemName ? ` · ${systemName}` : ''}
              </span>
              <span className="text-xs font-normal text-muted-foreground">
                ({entries.length})
              </span>
            </CardTitle>
            <ChevronDown
              className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`}
            />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="pt-0">
            <ul className="divide-y">
              {entries.map((entry) => (
                <li key={entry.id}>
                  <Link
                    href={`/dashboard/tasks/${entry.id}`}
                    className="-mx-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded px-2 py-2 transition-colors hover:bg-accent/40"
                  >
                    <div className="flex min-w-0 flex-col">
                      <span className="truncate text-sm font-medium text-foreground">
                        {entry.type}
                      </span>
                      {entry.date && (
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <CalendarIcon className="h-3 w-3 shrink-0" />
                          {formatDateUK(entry.date)}
                          {entry.reference && (
                            <span className="ml-1 font-mono">{entry.reference}</span>
                          )}
                        </span>
                      )}
                    </div>
                    {entry.status === 'completed' && entry.result ? (
                      <CallResultBadge status={entry.result} />
                    ) : (
                      <CallStatusBadge status={entry.status} />
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  )
}
