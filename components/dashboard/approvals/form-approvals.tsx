'use client'

import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { AlertCircle, ChevronRight, ClipboardCheck } from 'lucide-react'
import type { InternalTaskInstance } from '@/lib/types/database'
import { InternalTaskSheet } from '@/components/dashboard/internal-tasks/internal-task-sheet'

interface Props {
  approvals: InternalTaskInstance[]
}

// Central-Approvals-page section listing form/task submissions awaiting the
// current user's decision. Clicking one opens the shared review sheet, so any
// approval — not just leave — can be actioned from the Approvals page.
export function FormApprovals({ approvals }: Props) {
  const [active, setActive] = useState<InternalTaskInstance | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)

  function openReview(instance: InternalTaskInstance) {
    setActive(instance)
    setSheetOpen(true)
  }

  if (approvals.length === 0) return null

  return (
    <section className="space-y-4">
      <h2 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
        <ClipboardCheck className="h-5 w-5" />
        Forms &amp; Tasks
        <Badge variant="secondary">{approvals.length}</Badge>
      </h2>

      <div className="flex flex-col divide-y rounded-lg border">
        {approvals.map((inst) => (
          <button
            key={inst.id}
            type="button"
            onClick={() => openReview(inst)}
            className="flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-muted/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">
                {inst.template?.name ?? 'Form'}
              </p>
              <p className="text-xs text-muted-foreground">
                From {inst.user?.full_name ?? 'a team member'}
                {inst.completed_at
                  ? ` · ${new Date(inst.completed_at).toLocaleDateString('en-GB', {
                      day: 'numeric',
                      month: 'short',
                    })}`
                  : ''}
                {inst.reference_number ? ` · Ref ${inst.reference_number}` : ''}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Badge variant="outline" className="border-amber-500 text-amber-600">
                <AlertCircle className="mr-1 size-3.5" />
                Review
              </Badge>
              <ChevronRight className="size-4 text-muted-foreground" />
            </div>
          </button>
        ))}
      </div>

      {active ? (
        <InternalTaskSheet
          instance={active}
          open={sheetOpen}
          reviewMode
          submitterName={active.user?.full_name ?? null}
          onOpenChange={(v) => {
            setSheetOpen(v)
            if (!v) setActive(null)
          }}
        />
      ) : null}
    </section>
  )
}
