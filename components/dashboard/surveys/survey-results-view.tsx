'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  ArrowLeft,
  Send,
  Lock,
  Users,
  MessageSquare,
  Loader2,
  EyeOff,
} from 'lucide-react'
import type { InternalTaskTemplate } from '@/lib/types/database'
import type { SurveySummary, SurveyQuestionSummary } from '@/lib/surveys/summary'
import { sendSurveySummary, closeSurvey } from '@/lib/actions/surveys'

function fmtDate(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

// Horizontal proportion bar for a single option within a question.
function Bar({
  label,
  count,
  total,
  tone = 'default',
}: {
  label: string
  count: number
  total: number
  tone?: 'positive' | 'negative' | 'neutral' | 'default'
}) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0
  const toneClass =
    tone === 'positive'
      ? 'bg-green-500'
      : tone === 'negative'
        ? 'bg-destructive'
        : tone === 'neutral'
          ? 'bg-amber-500'
          : 'bg-primary'
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-sm">
        <span>{label}</span>
        <span className="text-muted-foreground">
          {count} · {pct}%
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div className={`h-full rounded-full ${toneClass}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

function QuestionCard({
  q,
  anonymous,
}: {
  q: SurveyQuestionSummary
  anonymous: boolean
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{q.label}</CardTitle>
        <CardDescription>{q.answered} response(s)</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {q.type === 'pass_fail' ? (
          <div className="space-y-3">
            <Bar label="Yes" count={q.passCount ?? 0} total={q.answered} tone="positive" />
            <Bar label="No" count={q.failCount ?? 0} total={q.answered} tone="negative" />
            {(q.advisoryCount ?? 0) > 0 ? (
              <Bar
                label="Maybe / advisory"
                count={q.advisoryCount ?? 0}
                total={q.answered}
                tone="neutral"
              />
            ) : null}
            {(q.naCount ?? 0) > 0 ? (
              <Bar label="N/A" count={q.naCount ?? 0} total={q.answered} tone="neutral" />
            ) : null}
          </div>
        ) : null}

        {q.type === 'checkbox' ? (
          <div className="space-y-3">
            <Bar
              label="Ticked"
              count={q.checkedCount ?? 0}
              total={q.answered}
              tone="positive"
            />
            <Bar
              label="Not ticked"
              count={q.uncheckedCount ?? 0}
              total={q.answered}
              tone="neutral"
            />
          </div>
        ) : null}

        {q.type === 'number' ? (
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="rounded-lg border p-3">
              <p className="text-2xl font-semibold">
                {q.average != null ? q.average.toFixed(1) : '—'}
              </p>
              <p className="text-xs text-muted-foreground">Average</p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-2xl font-semibold">{q.min ?? '—'}</p>
              <p className="text-xs text-muted-foreground">Lowest</p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-2xl font-semibold">{q.max ?? '—'}</p>
              <p className="text-xs text-muted-foreground">Highest</p>
            </div>
          </div>
        ) : null}

        {q.type === 'text' ? (
          q.textResponses && q.textResponses.length > 0 ? (
            <ul className="space-y-2">
              {q.textResponses.map((r, i) => (
                <li key={i} className="rounded-md border bg-muted/30 p-3 text-sm">
                  <p className="whitespace-pre-wrap">{r.value}</p>
                  <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                    {anonymous ? (
                      <>
                        <EyeOff className="size-3" /> Anonymous
                      </>
                    ) : (
                      <>
                        <MessageSquare className="size-3" /> {r.name ?? 'Unknown'}
                      </>
                    )}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No written responses yet.</p>
          )
        ) : null}

        {q.type === 'table' ? (
          <p className="text-sm text-muted-foreground">
            {q.tableRowCount ?? 0} row(s) submitted across {q.answered} response(s).
          </p>
        ) : null}
      </CardContent>
    </Card>
  )
}

export function SurveyResultsView({
  template,
  summary,
  outstanding,
}: {
  template: InternalTaskTemplate
  summary: SurveySummary
  outstanding?: string[]
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const isPublished = Boolean(template.survey_published_at)
  const isClosed = Boolean(template.survey_closed_at)

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, success: string) {
    startTransition(async () => {
      const res = await fn()
      if (res.ok) {
        toast.success(success)
        router.refresh()
      } else {
        toast.error(res.error ?? 'Something went wrong')
      }
    })
  }

  const statusBadge = isClosed ? (
    <Badge variant="outline">Closed</Badge>
  ) : isPublished ? (
    <Badge variant="outline" className="border-green-600 text-green-700">
      Open
    </Badge>
  ) : (
    <Badge variant="outline">Draft</Badge>
  )

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 p-4 sm:p-6">
      <div>
        <Button variant="ghost" size="sm" asChild className="mb-2 -ml-2">
          <Link href="/dashboard/settings?tab=tasks">
            <ArrowLeft className="size-4" />
            Back to surveys
          </Link>
        </Button>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-semibold text-balance">{template.name}</h1>
              {statusBadge}
              {template.survey_anonymous ? (
                <Badge variant="secondary" className="gap-1">
                  <EyeOff className="size-3" /> Anonymous
                </Badge>
              ) : null}
            </div>
            {template.description ? (
              <p className="mt-1 text-sm text-muted-foreground text-pretty">
                {template.description}
              </p>
            ) : null}
            <p className="mt-1 text-xs text-muted-foreground">
              {isPublished
                ? `Published ${fmtDate(template.survey_published_at)}`
                : 'Not yet published'}
              {template.survey_closes_at && !isClosed
                ? ` · closes ${fmtDate(template.survey_closes_at)}`
                : ''}
              {isClosed ? ` · closed ${fmtDate(template.survey_closed_at)}` : ''}
              {template.survey_summary_sent_at
                ? ` · summary sent ${fmtDate(template.survey_summary_sent_at)}`
                : ''}
            </p>
          </div>
          {isPublished ? (
            <div className="flex shrink-0 items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={pending}
                onClick={() => run(() => sendSurveySummary(template.id), 'Summary sent')}
              >
                {pending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Send className="size-4" />
                )}
                Send summary
              </Button>
              {!isClosed ? (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pending}
                  onClick={() => run(() => closeSurvey(template.id), 'Survey closed')}
                >
                  <Lock className="size-4" />
                  Close
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      {/* Response stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <p className="text-3xl font-semibold">{summary.totalResponded}</p>
            <p className="text-sm text-muted-foreground">Responses received</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-3xl font-semibold">{summary.totalInvited}</p>
            <p className="text-sm text-muted-foreground">Staff invited</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-3xl font-semibold">{summary.responseRate}%</p>
            <p className="text-sm text-muted-foreground">Response rate</p>
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary"
                style={{ width: `${summary.responseRate}%` }}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      {summary.totalResponded === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            {isPublished
              ? 'No responses yet. Check back once staff have completed the survey.'
              : 'Publish this survey to start collecting responses.'}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {summary.questions.map((q) => (
            <QuestionCard key={q.itemId} q={q} anonymous={summary.anonymous} />
          ))}
        </div>
      )}

      {/* Outstanding respondents (named surveys only) */}
      {!summary.anonymous && outstanding && outstanding.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="size-4" />
              Yet to respond ({outstanding.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {outstanding.map((name) => (
                <Badge key={name} variant="secondary">
                  {name}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}
