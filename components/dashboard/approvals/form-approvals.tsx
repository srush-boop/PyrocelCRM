'use client'

import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  AlertCircle,
  ChevronRight,
  Clock,
  CheckCircle2,
  XCircle,
} from 'lucide-react'
import type { InternalTaskInstance } from '@/lib/types/database'
import { InternalTaskSheet } from '@/components/dashboard/internal-tasks/internal-task-sheet'

interface Props {
  pending: InternalTaskInstance[]
  decided: InternalTaskInstance[]
}

// Central-Approvals-page section for form/task submissions. The Pending tab
// lists submissions awaiting the current user's decision; the Approved tab is a
// read-only history of everything they (or, for managers, anyone) has decided.
// Clicking any row opens the shared review sheet.
export function FormApprovals({ pending, decided }: Props) {
  const [active, setActive] = useState<InternalTaskInstance | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)

  function openReview(instance: InternalTaskInstance) {
    setActive(instance)
    setSheetOpen(true)
  }

  return (
    <section className="space-y-4">
      <h2 className="text-xl font-semibold tracking-tight">Forms &amp; Tasks</h2>

      <Tabs defaultValue="pending" className="space-y-4">
        <TabsList>
          <TabsTrigger value="pending" className="gap-2">
            <Clock className="h-4 w-4" />
            To Be Approved
            {pending.length > 0 && (
              <Badge variant="secondary" className="ml-1">
                {pending.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="approved" className="gap-2">
            <CheckCircle2 className="h-4 w-4" />
            Decided
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pending">
          {pending.length === 0 ? (
            <EmptyState text="No form or task submissions waiting for approval." />
          ) : (
            <div className="flex flex-col divide-y rounded-lg border">
              {pending.map((inst) => (
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
                        ? ` · ${formatDate(inst.completed_at)}`
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
          )}
        </TabsContent>

        <TabsContent value="approved">
          {decided.length === 0 ? (
            <EmptyState text="No decided submissions yet." />
          ) : (
            <div className="flex flex-col divide-y rounded-lg border">
              {decided.map((inst) => {
                const approved = inst.approval_status === 'approved'
                return (
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
                        {inst.approver?.full_name
                          ? ` · by ${inst.approver.full_name}`
                          : ''}
                        {inst.approved_at ? ` · ${formatDate(inst.approved_at)}` : ''}
                        {inst.reference_number ? ` · Ref ${inst.reference_number}` : ''}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {approved ? (
                        <Badge className="bg-emerald-600 text-white hover:bg-emerald-600/90">
                          <CheckCircle2 className="mr-1 size-3.5" />
                          Approved
                        </Badge>
                      ) : (
                        <Badge variant="destructive">
                          <XCircle className="mr-1 size-3.5" />
                          Declined
                        </Badge>
                      )}
                      <ChevronRight className="size-4 text-muted-foreground" />
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

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

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
  })
}

function EmptyState({ text }: { text: string }) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center py-12 text-center">
        <CheckCircle2 className="mb-3 h-10 w-10 text-muted-foreground/40" />
        <p className="text-sm text-muted-foreground">{text}</p>
      </CardContent>
    </Card>
  )
}
