'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  ClipboardList,
  FileText,
  Inbox,
  Send,
  Loader2,
  Check,
  X,
  AlertCircle,
  ChevronRight,
} from 'lucide-react'
import type { InternalTaskInstance, InternalTaskTemplate } from '@/lib/types/database'
import { MyTasksList } from './my-tasks-list'
import { InternalTaskSheet } from './internal-task-sheet'
import { startOnDemandInstance } from '@/lib/actions/internal-tasks'

interface Props {
  tasks: InternalTaskInstance[]
  forms: InternalTaskTemplate[]
  submissions: InternalTaskInstance[]
  approvals: InternalTaskInstance[]
}

export function TasksAndForms({ tasks, forms, submissions, approvals }: Props) {
  const router = useRouter()
  const [active, setActive] = useState<InternalTaskInstance | null>(null)
  const [reviewMode, setReviewMode] = useState(false)
  const [submitterName, setSubmitterName] = useState<string | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [starting, startTransition] = useTransition()
  const [startingId, setStartingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const outstandingCount = tasks.filter((t) => t.status !== 'completed').length
  const showApprovals = approvals.length > 0

  function openFill(instance: InternalTaskInstance) {
    setActive(instance)
    setReviewMode(false)
    setSubmitterName(null)
    setSheetOpen(true)
  }

  function openReview(instance: InternalTaskInstance) {
    setActive(instance)
    setReviewMode(true)
    setSubmitterName(instance.user?.full_name ?? null)
    setSheetOpen(true)
  }

  function startForm(form: InternalTaskTemplate) {
    setError(null)
    setStartingId(form.id)
    startTransition(async () => {
      const result = await startOnDemandInstance(form.id)
      setStartingId(null)
      if (!result.ok || !result.instance) {
        setError(result.error ?? 'Could not open form.')
        return
      }
      openFill(result.instance)
    })
  }

  return (
    <>
      <Tabs defaultValue={outstandingCount > 0 ? 'tasks' : 'forms'}>
        <TabsList>
          <TabsTrigger value="tasks" className="gap-1.5">
            <ClipboardList className="size-4" />
            My tasks
            {outstandingCount > 0 ? (
              <Badge variant="secondary" className="ml-1 px-1.5">
                {outstandingCount}
              </Badge>
            ) : null}
          </TabsTrigger>
          <TabsTrigger value="forms" className="gap-1.5">
            <FileText className="size-4" />
            Forms
          </TabsTrigger>
          <TabsTrigger value="submissions" className="gap-1.5">
            <Send className="size-4" />
            My submissions
          </TabsTrigger>
          {showApprovals ? (
            <TabsTrigger value="approvals" className="gap-1.5">
              <Inbox className="size-4" />
              Approvals
              <Badge className="ml-1 px-1.5">{approvals.length}</Badge>
            </TabsTrigger>
          ) : null}
        </TabsList>

        {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}

        <TabsContent value="tasks" className="mt-4">
          <MyTasksList instances={tasks} />
        </TabsContent>

        <TabsContent value="forms" className="mt-4">
          {forms.length === 0 ? (
            <EmptyState
              icon={FileText}
              text="No forms are available yet. An administrator can create on-demand forms in Settings."
            />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {forms.map((form) => (
                <Card key={form.id} className="flex flex-col">
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="text-base leading-tight text-balance">
                        {form.name}
                      </CardTitle>
                      {form.requires_approval ? (
                        <Badge variant="outline" className="shrink-0">
                          Approval
                        </Badge>
                      ) : null}
                    </div>
                  </CardHeader>
                  <CardContent className="flex flex-1 flex-col gap-3">
                    {form.description ? (
                      <p className="line-clamp-3 text-sm leading-relaxed text-muted-foreground">
                        {form.description}
                      </p>
                    ) : null}
                    <div className="mt-auto">
                      <Button
                        size="sm"
                        onClick={() => startForm(form)}
                        disabled={starting && startingId === form.id}
                      >
                        {starting && startingId === form.id ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <FileText className="size-4" />
                        )}
                        Start form
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="submissions" className="mt-4">
          {submissions.length === 0 ? (
            <EmptyState
              icon={Send}
              text="You haven't submitted any forms yet. Start one from the Forms tab."
            />
          ) : (
            <div className="flex flex-col divide-y rounded-lg border">
              {submissions.map((sub) => (
                <button
                  key={sub.id}
                  type="button"
                  onClick={() => openFill(sub)}
                  className="flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-muted/50"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {sub.template?.name ?? 'Form'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {sub.status === 'completed' ? 'Submitted' : 'Draft'}
                      {sub.completed_at
                        ? ` ${new Date(sub.completed_at).toLocaleDateString('en-GB', {
                            day: 'numeric',
                            month: 'short',
                          })}`
                        : ''}
                      {sub.reference_number ? ` · Ref ${sub.reference_number}` : ''}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <SubmissionStatus instance={sub} />
                    <ChevronRight className="size-4 text-muted-foreground" />
                  </div>
                </button>
              ))}
            </div>
          )}
        </TabsContent>

        {showApprovals ? (
          <TabsContent value="approvals" className="mt-4">
            <div className="flex flex-col divide-y rounded-lg border">
              {approvals.map((inst) => (
                <button
                  key={inst.id}
                  type="button"
                  onClick={() => openReview(inst)}
                  className="flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-muted/50"
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
          </TabsContent>
        ) : null}
      </Tabs>

      {active ? (
        <InternalTaskSheet
          instance={active}
          open={sheetOpen}
          reviewMode={reviewMode}
          submitterName={submitterName}
          onOpenChange={(v) => {
            setSheetOpen(v)
            if (!v) setActive(null)
          }}
        />
      ) : null}
    </>
  )
}

function SubmissionStatus({ instance }: { instance: InternalTaskInstance }) {
  if (instance.status !== 'completed') {
    return <Badge variant="outline">Draft</Badge>
  }
  if (!instance.approval_status) {
    return (
      <Badge className="bg-green-600 text-white hover:bg-green-600/90">
        <Check className="mr-1 size-3.5" />
        Submitted
      </Badge>
    )
  }
  if (instance.approval_status === 'approved') {
    return (
      <Badge className="bg-green-600 text-white hover:bg-green-600/90">
        <Check className="mr-1 size-3.5" />
        Approved
      </Badge>
    )
  }
  if (instance.approval_status === 'rejected') {
    return (
      <Badge variant="destructive">
        <X className="mr-1 size-3.5" />
        Rejected
      </Badge>
    )
  }
  return (
    <Badge variant="outline" className="border-amber-500 text-amber-600">
      <AlertCircle className="mr-1 size-3.5" />
      Awaiting approval
    </Badge>
  )
}

function EmptyState({
  icon: Icon,
  text,
}: {
  icon: typeof FileText
  text: string
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 py-8 text-muted-foreground">
        <Icon className="size-5 shrink-0" />
        <span className="text-sm text-pretty">{text}</span>
      </CardContent>
    </Card>
  )
}
