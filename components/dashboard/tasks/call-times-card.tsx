'use client'

import { useEffect, useRef, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Play, StopCircle } from 'lucide-react'
import { setCallTimes } from '@/lib/actions/call-times'

/** Convert an ISO/Date value to a `datetime-local` input string (local time). */
function toDatetimeLocalValue(value: Date | null): string {
  if (!value) return ''
  const tzOffset = value.getTimezoneOffset() * 60000
  return new Date(value.getTime() - tzOffset).toISOString().slice(0, 16)
}

/**
 * On-site start / end time for a call, backed by tasks.started_at /
 * completed_at. Used by the asset execution flows so start and end are shown as
 * separate, editable cards (start before the body, end after at completion) —
 * consistent with the generic flow. Both auto-populate but stay adjustable.
 *
 * `mode` picks which timestamp this card edits. `autoSetOnMount` (used for the
 * end card at completion) stamps "now" if the value is still empty.
 */
export function CallTimeCard({
  taskId,
  mode,
  initialValue,
  canEdit,
  autoSetOnMount = false,
  onChange,
}: {
  taskId: string
  mode: 'start' | 'end'
  initialValue: string | null
  canEdit: boolean
  autoSetOnMount?: boolean
  /** Notified whenever the value changes, so a parent can feed it into its
      own completion handler (used for the end time). */
  onChange?: (value: Date | null) => void
}) {
  const [value, setValue] = useState<Date | null>(initialValue ? new Date(initialValue) : null)
  const didAutoSet = useRef(false)

  const isStart = mode === 'start'
  const label = isStart ? 'Start time' : 'End time'

  const persist = (next: Date | null) => {
    void setCallTimes(taskId, {
      [isStart ? 'startedAt' : 'completedAt']: next ? next.toISOString() : null,
    })
  }

  const update = (next: Date | null) => {
    setValue(next)
    onChange?.(next)
    persist(next)
  }

  // End card: default to now on first render at completion (adjustable after).
  useEffect(() => {
    if (autoSetOnMount && !didAutoSet.current && canEdit && !value) {
      didAutoSet.current = true
      update(new Date())
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoSetOnMount, canEdit])

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          {isStart ? (
            <Play className="h-4 w-4 text-muted-foreground" />
          ) : (
            <StopCircle className="h-4 w-4 text-muted-foreground" />
          )}
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex gap-2">
          <Input
            type="datetime-local"
            value={toDatetimeLocalValue(value)}
            onChange={(e) => update(e.target.value ? new Date(e.target.value) : null)}
            disabled={!canEdit}
            className="min-w-0 flex-1"
            aria-label={label}
          />
          {canEdit && (
            <Button
              type="button"
              variant={value ? 'outline' : 'default'}
              size="sm"
              onClick={() => update(new Date())}
              title="Set to now"
              className="h-10 shrink-0 gap-1.5 px-3 text-xs"
            >
              {isStart ? <Play className="h-3.5 w-3.5" /> : <StopCircle className="h-3.5 w-3.5" />}
              Now
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
