'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { Wrench, Package, ExternalLink, UserCheck, AlertTriangle } from 'lucide-react'
import { formatDateUK } from '@/lib/utils'
import { takeRemedialOwnership } from '@/lib/actions/remedial-ownership'
import type { OpenRemedialCall } from '@/lib/remedial'

/**
 * The single, consolidated "Outstanding remedial" section shown on every call
 * at a site that has open remedial work. It replaces the previously scattered
 * remedial references (pre-attendance callout, badge, origin note) with one
 * place that shows the actual work required and parts required, plus a way to
 * view the remedial call and take ownership of it.
 *
 * `currentUserId` lets us show "Assigned to you" instead of the claim button
 * when the viewer already owns the call.
 */
export function OutstandingRemedialCard({
  calls,
  currentUserId,
  canTakeOwnership = false,
}: {
  calls: OpenRemedialCall[]
  currentUserId: string
  /** Whether the viewer may claim/reassign the remedial call to themselves. */
  canTakeOwnership?: boolean
}) {
  if (calls.length === 0) return null

  return (
    <Card className="border-amber-500/50 bg-amber-50/50 dark:bg-amber-950/10">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base text-amber-900 dark:text-amber-200">
          <AlertTriangle className="h-4 w-4" />
          Outstanding remedial{calls.length > 1 ? ` (${calls.length})` : ''}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-amber-900/80 dark:text-amber-200/80">
          This site has remedial work outstanding. Review the work and parts required below.
        </p>
        {calls.map((call) => (
          <RemedialItem
            key={call.id}
            call={call}
            currentUserId={currentUserId}
            canTakeOwnership={canTakeOwnership}
          />
        ))}
      </CardContent>
    </Card>
  )
}

function RemedialItem({
  call,
  currentUserId,
  canTakeOwnership,
}: {
  call: OpenRemedialCall
  currentUserId: string
  canTakeOwnership: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [claimed, setClaimed] = useState(false)

  const ownedByMe = call.assignedEngineerId === currentUserId

  const handleTakeOwnership = () => {
    startTransition(async () => {
      const result = await takeRemedialOwnership(call.id)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      setClaimed(true)
      toast.success('Remedial call assigned to you. Opening it now…')
      router.push(`/dashboard/tasks/${call.id}`)
    })
  }

  return (
    <div className="rounded-lg border bg-background p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="font-medium">Remedial call</span>
          {call.reference && (
            <span className="font-mono text-xs text-muted-foreground">{call.reference}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {call.scheduledDate && (
            <Badge variant="secondary" className="text-xs">
              Due {formatDateUK(call.scheduledDate)}
            </Badge>
          )}
          {call.assignedEngineerName ? (
            <Badge variant="outline" className="text-xs">
              {ownedByMe ? 'Assigned to you' : `Owner: ${call.assignedEngineerName}`}
            </Badge>
          ) : (
            <Badge variant="outline" className="text-xs">
              Unassigned
            </Badge>
          )}
        </div>
      </div>

      {/* Work required */}
      <div className="mt-3">
        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <Wrench className="h-3.5 w-3.5" />
          Work required
        </p>
        {call.worksDescription?.trim() ? (
          <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed">{call.worksDescription}</p>
        ) : (
          <p className="mt-1 text-sm italic text-muted-foreground">
            No detail recorded on the remedial call.
          </p>
        )}
      </div>

      {/* Parts required */}
      {call.parts.length > 0 && (
        <div className="mt-3">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <Package className="h-3.5 w-3.5" />
            Parts required
          </p>
          <ul className="mt-1 space-y-1">
            {call.parts.map((part) => (
              <li key={part.id} className="flex items-center justify-between gap-2 text-sm">
                <span className="min-w-0 truncate">
                  {part.name}
                  {part.sku && <span className="ml-1 font-mono text-xs text-muted-foreground">{part.sku}</span>}
                </span>
                <span className="shrink-0 tabular-nums text-muted-foreground">
                  {part.quantity}
                  {part.unit ? ` ${part.unit}` : ''}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Actions */}
      <div className="mt-4 flex flex-wrap gap-2">
        <Button asChild variant="outline" size="sm">
          <Link href={`/dashboard/tasks/${call.id}`}>
            <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
            View remedial call
          </Link>
        </Button>
        {!ownedByMe && canTakeOwnership && (
          <Button size="sm" onClick={handleTakeOwnership} disabled={pending || claimed}>
            <UserCheck className="mr-1.5 h-3.5 w-3.5" />
            {pending || claimed ? 'Taking ownership…' : 'Take ownership'}
          </Button>
        )}
      </div>
    </div>
  )
}
