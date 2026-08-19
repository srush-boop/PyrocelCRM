'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { CalendarClock, CheckCircle2, ClipboardList, FileText, Wrench } from 'lucide-react'
import { cn, formatDateUK } from '@/lib/utils'
import type { InternalTaskInstance } from '@/lib/types/database'
import type { MyAssetCheck } from '@/lib/asset-checks'
import { CHECK_TYPE_LABELS, daysUntil, dueStatus } from '@/lib/assets'
import { InternalTaskSheet } from './internal-task-sheet'

interface Props {
  instances: InternalTaskInstance[]
  /** Due/overdue asset checks the user is responsible for (shown as outstanding). */
  assetChecks?: MyAssetCheck[]
}

/** A row in the merged Outstanding list: either an internal task or an asset check. */
type OutstandingRow =
  | { kind: 'task'; dueMs: number; instance: InternalTaskInstance }
  | { kind: 'asset'; dueMs: number; check: MyAssetCheck }

function assetDueMs(nextDue: string | null): number {
  if (!nextDue) return Number.POSITIVE_INFINITY
  return new Date(nextDue + 'T00:00:00Z').getTime()
}

function formatAssetDue(nextDue: string | null): { label: string; overdue: boolean } {
  const overdue = dueStatus(nextDue) === 'overdue'
  const diff = daysUntil(nextDue)
  const date = nextDue ? formatDateUK(nextDue) : ''
  if (diff == null) return { label: 'No due date', overdue: false }
  if (diff < 0) return { label: `Overdue — was due ${date} (${Math.abs(diff)}d ago)`, overdue: true }
  if (diff === 0) return { label: `Due today (${date})`, overdue: false }
  return { label: `Due in ${diff}d (${date})`, overdue: false }
}

function formatDue(due: string | null): { label: string; tone: 'overdue' | 'soon' | 'ok' } {
  if (!due) return { label: 'No deadline', tone: 'ok' }
  const now = Date.now()
  const dueMs = new Date(due).getTime()
  const diffMs = dueMs - now
  const dayMs = 24 * 60 * 60 * 1000
  const dateLabel = new Date(due).toLocaleString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
  if (diffMs < 0) return { label: `Overdue — was due ${dateLabel}`, tone: 'overdue' }
  if (diffMs < 2 * dayMs) return { label: `Due ${dateLabel}`, tone: 'soon' }
  return { label: `Due ${dateLabel}`, tone: 'ok' }
}

export function MyTasksList({ instances, assetChecks = [] }: Props) {
  const [active, setActive] = useState<InternalTaskInstance | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)

  const { outstandingRows, outstandingCount, completed } = useMemo(() => {
    const taskRows: OutstandingRow[] = instances
      .filter((i) => i.status !== 'completed')
      .map((instance) => ({
        kind: 'task' as const,
        dueMs: new Date(instance.due_at ?? 0).getTime(),
        instance,
      }))
    const assetRows: OutstandingRow[] = assetChecks.map((check) => ({
      kind: 'asset' as const,
      dueMs: assetDueMs(check.next_due_date),
      check,
    }))
    // Merge tasks + asset checks into one list, most urgent (soonest due) first.
    const outstandingRows = [...taskRows, ...assetRows].sort((a, b) => a.dueMs - b.dueMs)
    const completed = instances
      .filter((i) => i.status === 'completed')
      .sort(
        (a, b) =>
          new Date(b.completed_at ?? b.due_at ?? 0).getTime() -
          new Date(a.completed_at ?? a.due_at ?? 0).getTime(),
      )
    return { outstandingRows, outstandingCount: outstandingRows.length, completed }
  }, [instances, assetChecks])

  function openInstance(instance: InternalTaskInstance) {
    setActive(instance)
    setSheetOpen(true)
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">
          Outstanding ({outstandingCount})
        </h2>
        {outstandingCount === 0 ? (
          <Card>
            <CardContent className="flex items-center gap-3 py-8 text-muted-foreground">
              <CheckCircle2 className="size-5 text-primary" />
              <span>You&apos;re all caught up — no outstanding tasks.</span>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {outstandingRows.map((row) =>
              row.kind === 'asset'
                ? renderAssetCheckCard(row.check)
                : renderTaskCard(row.instance, openInstance),
            )}
          </div>
        )}
      </section>

      {completed.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-medium text-muted-foreground">
            Recently completed
          </h2>
          <div className="flex flex-col divide-y rounded-lg border">
            {completed.slice(0, 12).map((instance) => (
              <button
                key={instance.id}
                type="button"
                onClick={() => openInstance(instance)}
                className="flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-muted/50"
              >
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="size-4 shrink-0 text-primary" />
                  <div>
                    <p className="text-sm font-medium">
                      {instance.template?.name ?? 'Task'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Completed{' '}
                      {instance.completed_at
                        ? new Date(instance.completed_at).toLocaleDateString('en-GB', {
                            day: 'numeric',
                            month: 'short',
                          })
                        : ''}
                      {instance.reference_number ? ` · Ref ${instance.reference_number}` : ''}
                    </p>
                  </div>
                </div>
                <Badge variant="outline">View</Badge>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {active ? (
        <InternalTaskSheet
          instance={active}
          open={sheetOpen}
          onOpenChange={(v) => {
            setSheetOpen(v)
            if (!v) setActive(null)
          }}
        />
      ) : null}
    </div>
  )
}

/** An internal task instance rendered as an outstanding card (opens the sheet). */
function renderTaskCard(
  instance: InternalTaskInstance,
  openInstance: (instance: InternalTaskInstance) => void,
) {
  const due = formatDue(instance.due_at)
  return (
    <Card
      key={`task-${instance.id}`}
      className={cn('flex flex-col', due.tone === 'overdue' && 'border-destructive/50')}
    >
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-base leading-tight text-balance">
            {instance.template?.name ?? 'Task'}
          </CardTitle>
          {instance.template?.category ? (
            <Badge variant="secondary" className="shrink-0">
              {instance.template.category}
            </Badge>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-3">
        {instance.template?.description ? (
          <p className="text-sm text-muted-foreground leading-relaxed line-clamp-2">
            {instance.template.description}
          </p>
        ) : null}
        <div
          className={cn(
            'flex items-center gap-2 text-sm',
            due.tone === 'overdue'
              ? 'text-destructive'
              : due.tone === 'soon'
                ? 'text-amber-600'
                : 'text-muted-foreground',
          )}
        >
          <CalendarClock className="size-4 shrink-0" />
          <span>{due.label}</span>
        </div>
        <div className="mt-auto flex items-center gap-2">
          <Button size="sm" onClick={() => openInstance(instance)}>
            {instance.template?.questions?.length ? (
              <ClipboardList className="size-4" />
            ) : (
              <FileText className="size-4" />
            )}
            Complete
          </Button>
          {instance.template?.requires_reference ? (
            <span className="text-xs text-muted-foreground">Reference required</span>
          ) : null}
        </div>
      </CardContent>
    </Card>
  )
}

/**
 * A due/overdue asset check rendered as an outstanding card. Asset checks are
 * completed on the asset's own page, so the whole card links there rather than
 * opening the internal-task sheet.
 */
function renderAssetCheckCard(check: MyAssetCheck) {
  const due = formatAssetDue(check.next_due_date)
  return (
    <Link
      key={`asset-${check.id}`}
      href={`/dashboard/assets/${check.asset?.urn ?? ''}`}
      className="block h-full"
    >
      <Card
        className={cn(
          'flex h-full flex-col transition-colors hover:bg-muted/50',
          due.overdue && 'border-destructive/50',
        )}
      >
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between gap-2">
            <CardTitle className="text-base leading-tight text-balance">
              {check.asset?.name ?? 'Asset'}
            </CardTitle>
            <Badge variant="outline" className="shrink-0">
              Asset check
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="flex flex-1 flex-col gap-3">
          <p className="text-sm text-muted-foreground leading-relaxed line-clamp-2">
            {CHECK_TYPE_LABELS[check.check_type]}: {check.name}
          </p>
          <div
            className={cn(
              'flex items-center gap-2 text-sm',
              due.overdue ? 'text-destructive' : 'text-amber-600',
            )}
          >
            <CalendarClock className="size-4 shrink-0" />
            <span>{due.label}</span>
          </div>
          <div className="mt-auto flex items-center gap-2">
            <Button size="sm" variant="secondary" asChild>
              <span>
                <Wrench className="size-4" />
                Open asset
              </span>
            </Button>
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}
