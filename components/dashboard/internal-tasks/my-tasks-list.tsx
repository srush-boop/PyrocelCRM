'use client'

import { useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { CalendarClock, CheckCircle2, ClipboardList, FileText } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { InternalTaskInstance } from '@/lib/types/database'
import { InternalTaskSheet } from './internal-task-sheet'

interface Props {
  instances: InternalTaskInstance[]
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

export function MyTasksList({ instances }: Props) {
  const [active, setActive] = useState<InternalTaskInstance | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)

  const { outstanding, completed } = useMemo(() => {
    const outstanding = instances
      .filter((i) => i.status !== 'completed')
      .sort((a, b) => new Date(a.due_at ?? 0).getTime() - new Date(b.due_at ?? 0).getTime())
    const completed = instances
      .filter((i) => i.status === 'completed')
      .sort(
        (a, b) =>
          new Date(b.completed_at ?? b.due_at ?? 0).getTime() -
          new Date(a.completed_at ?? a.due_at ?? 0).getTime(),
      )
    return { outstanding, completed }
  }, [instances])

  function openInstance(instance: InternalTaskInstance) {
    setActive(instance)
    setSheetOpen(true)
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">
          Outstanding ({outstanding.length})
        </h2>
        {outstanding.length === 0 ? (
          <Card>
            <CardContent className="flex items-center gap-3 py-8 text-muted-foreground">
              <CheckCircle2 className="size-5 text-primary" />
              <span>You&apos;re all caught up — no outstanding tasks.</span>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {outstanding.map((instance) => {
              const due = formatDue(instance.due_at)
              return (
                <Card
                  key={instance.id}
                  className={cn(
                    'flex flex-col',
                    due.tone === 'overdue' && 'border-destructive/50',
                  )}
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
                        <span className="text-xs text-muted-foreground">
                          Reference required
                        </span>
                      ) : null}
                    </div>
                  </CardContent>
                </Card>
              )
            })}
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
