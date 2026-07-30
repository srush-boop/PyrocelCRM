'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  Sparkles,
  Loader2,
  SendHorizonal,
  Copy,
  RefreshCw,
  FileText,
  CalendarClock,
  FileSignature,
  History,
  IdCard,
  CheckCircle2,
  ExternalLink,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { cn, formatDateUK } from '@/lib/utils'
import { prepareAnswer, sendInboundAnswer, markAnswerCopied } from '@/lib/actions/inbound-requests'
import type { InboundRequest, RequestAnswerKind, RequestAnswerFacts } from '@/lib/types/database'

const KIND_META: Record<
  RequestAnswerKind,
  { label: string; Icon: React.ComponentType<{ className?: string }> }
> = {
  reports: { label: 'Latest reports', Icon: FileText },
  next_due: { label: 'Next service due', Icon: CalendarClock },
  quote_status: { label: 'Quote status', Icon: FileSignature },
  service_history: { label: 'Service history', Icon: History },
  account_info: { label: 'Account details', Icon: IdCard },
}

export function PreparedAnswerCard({
  request: r,
  disabled,
}: {
  request: InboundRequest
  disabled?: boolean
}) {
  const router = useRouter()
  const prepared = !!r.answer_prepared_at
  const sent = !!r.answer_sent_at
  const isClosed = r.status === 'actioned' || r.status === 'dismissed'

  const [subject, setSubject] = useState(r.answer_subject ?? '')
  const [body, setBody] = useState(r.answer_body ?? '')
  const [recipients, setRecipients] = useState(r.from_email ?? '')
  const [preparing, setPreparing] = useState(false)
  const [sending, setSending] = useState(false)

  // Whether we can even offer to prepare an answer (needs a matched site or client).
  const canPrepare = !!r.matched_site_id || !!r.matched_client_id

  async function handlePrepare() {
    setPreparing(true)
    try {
      const res = await prepareAnswer(r.id)
      if (!res.ok) toast.error(res.error ?? 'Could not prepare an answer.')
      else toast.success('Answer prepared.')
      router.refresh()
    } finally {
      setPreparing(false)
    }
  }

  async function handleSend() {
    const list = recipients
      .split(/[,;\s]+/)
      .map((e) => e.trim())
      .filter(Boolean)
    if (list.length === 0) {
      toast.error('Add at least one recipient email.')
      return
    }
    setSending(true)
    try {
      const res = await sendInboundAnswer(r.id, { subject, body, recipients: list })
      if (!res.ok) toast.error(res.error ?? 'Could not send the reply.')
      else toast.success('Reply sent to the client.')
      router.refresh()
    } finally {
      setSending(false)
    }
  }

  async function handleCopy() {
    const text = subject ? `Subject: ${subject}\n\n${body}` : body
    try {
      await navigator.clipboard.writeText(text)
      toast.success('Draft copied to clipboard.')
    } catch {
      toast.error('Could not copy — select and copy manually.')
    }
    // Log the outcome so the request moves to Actioned (persists any edits too).
    await markAnswerCopied(r.id, { subject, body })
    router.refresh()
  }

  // Not prepared yet: offer a Prepare button when we have something to research.
  if (!prepared) {
    if (isClosed || !canPrepare) return null
    return (
      <div className="mt-4 rounded-lg border border-dashed p-4">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <p className="text-sm font-medium">Prepare a data-backed answer</p>
        </div>
        <p className="mt-1 text-xs text-muted-foreground text-pretty">
          Let AI research this against the site&apos;s records (reports, next service due, quotes,
          history) and draft a reply for you to review and send.
        </p>
        <Button size="sm" className="mt-3" onClick={handlePrepare} disabled={preparing || disabled}>
          {preparing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
          Prepare answer
        </Button>
      </div>
    )
  }

  const kind = r.answer_kind
  const meta = kind ? KIND_META[kind] : null
  const facts = r.answer_facts ?? null

  return (
    <div className="mt-4 rounded-lg border border-primary/25 bg-primary/[0.04] p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-primary">
          <Sparkles className="h-3.5 w-3.5" />
          AI-prepared answer
        </p>
        {meta && (
          <Badge variant="outline" className="gap-1 border-primary/30 text-primary">
            <meta.Icon className="h-3 w-3" />
            {meta.label}
          </Badge>
        )}
        {sent && (
          <Badge variant="outline" className="ml-auto gap-1 border-primary/30 bg-primary/10 text-primary">
            <CheckCircle2 className="h-3 w-3" />
            Sent
          </Badge>
        )}
      </div>

      {/* Facts summary the draft is grounded in */}
      {facts && <FactsSummary facts={facts} kind={kind} />}

      {sent ? (
        <div className="rounded-md border bg-muted/40 p-3 text-sm">
          <p className="text-muted-foreground">
            Sent {r.answer_sent_at ? `on ${formatDateUK(r.answer_sent_at)}` : ''}
            {r.answer_sent_to && r.answer_sent_to.length > 0
              ? ` to ${r.answer_sent_to.join(', ')}`
              : ''}
            .
          </p>
          {subject && <p className="mt-2 font-medium">{subject}</p>}
          <p className="mt-1 whitespace-pre-wrap text-muted-foreground">{body}</p>
        </div>
      ) : (
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor={`ans-subject-${r.id}`} className="text-xs text-muted-foreground">
              Subject
            </Label>
            <Input
              id={`ans-subject-${r.id}`}
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              disabled={isClosed}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`ans-body-${r.id}`} className="text-xs text-muted-foreground">
              Reply
            </Label>
            <Textarea
              id={`ans-body-${r.id}`}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={10}
              disabled={isClosed}
              className="resize-y font-normal"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`ans-to-${r.id}`} className="text-xs text-muted-foreground">
              Send to (comma-separated)
            </Label>
            <Input
              id={`ans-to-${r.id}`}
              value={recipients}
              onChange={(e) => setRecipients(e.target.value)}
              placeholder="client@example.com"
              disabled={isClosed}
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={handleSend} disabled={sending || preparing || disabled || isClosed}>
              {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <SendHorizonal className="h-3.5 w-3.5" />}
              Send now
            </Button>
            <Button size="sm" variant="outline" onClick={handleCopy} disabled={sending || preparing || disabled}>
              <Copy className="h-3.5 w-3.5" />
              Copy draft
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={handlePrepare}
              disabled={preparing || sending || disabled || isClosed}
              className="ml-auto"
            >
              {preparing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              Regenerate
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Review the draft before sending. &ldquo;Send now&rdquo; emails the client directly; &ldquo;Copy
            draft&rdquo; lets you send it from your own mailbox.
          </p>
        </div>
      )}
    </div>
  )
}

// ── Kind-aware facts summary ──────────────────────────────────────────────────

function FactsSummary({
  facts,
  kind,
}: {
  facts: RequestAnswerFacts
  kind: RequestAnswerKind | null
}) {
  if (kind === 'reports' && facts.reports && facts.reports.length > 0) {
    return (
      <FactBlock title={`${facts.reports.length} report${facts.reports.length === 1 ? '' : 's'} found`}>
        <ul className="space-y-1.5">
          {facts.reports.map((rep, i) => (
            <li key={i} className="flex items-center gap-2 text-sm">
              <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate">
                {[rep.systemName, rep.serviceName].filter(Boolean).join(' · ') || 'Report'}
                {rep.completedDate ? ` — ${formatDateUK(rep.completedDate)}` : ''}
              </span>
              {rep.status && <StatusPill status={rep.status} />}
              {rep.link && (
                <a
                  href={rep.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex shrink-0 items-center gap-1 text-xs text-primary hover:underline"
                >
                  Open <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </li>
          ))}
        </ul>
      </FactBlock>
    )
  }

  if (kind === 'next_due' && facts.nextDue && facts.nextDue.length > 0) {
    return (
      <FactBlock title="Next service due">
        <ul className="space-y-1.5">
          {facts.nextDue.map((n, i) => (
            <li key={i} className="flex items-center justify-between gap-2 text-sm">
              <span className="min-w-0 flex-1 truncate">
                {[n.systemName, n.serviceName].filter(Boolean).join(' · ')}
                {n.frequency ? <span className="text-muted-foreground"> · {n.frequency}</span> : null}
              </span>
              {n.nextDue && (
                <span className="shrink-0 font-medium tabular-nums">{formatDateUK(n.nextDue)}</span>
              )}
            </li>
          ))}
        </ul>
      </FactBlock>
    )
  }

  if (kind === 'quote_status' && facts.quotes && facts.quotes.length > 0) {
    return (
      <FactBlock title={`${facts.quotes.length} quote${facts.quotes.length === 1 ? '' : 's'}`}>
        <ul className="space-y-1.5">
          {facts.quotes.map((q, i) => (
            <li key={i} className="flex items-center justify-between gap-2 text-sm">
              <span className="min-w-0 flex-1 truncate">
                {q.number ? `${q.number} · ` : ''}
                {q.title || 'Quote'}
              </span>
              <span className="flex shrink-0 items-center gap-2">
                {q.total && <span className="tabular-nums">{q.total}</span>}
                {q.status && <StatusPill status={q.status} />}
              </span>
            </li>
          ))}
        </ul>
      </FactBlock>
    )
  }

  if (kind === 'service_history' && facts.history && facts.history.length > 0) {
    return (
      <FactBlock title="Recent visits">
        <ul className="space-y-1.5">
          {facts.history.map((h, i) => (
            <li key={i} className="flex items-center justify-between gap-2 text-sm">
              <span className="min-w-0 flex-1 truncate">
                {h.serviceName || 'Visit'}
                {h.date ? ` — ${formatDateUK(h.date)}` : ''}
              </span>
              {h.status && <StatusPill status={h.status} />}
            </li>
          ))}
        </ul>
      </FactBlock>
    )
  }

  if (kind === 'account_info' && facts.account) {
    const a = facts.account
    return (
      <FactBlock title="Account details">
        <div className="space-y-1 text-sm">
          {a.contactName && <p>{a.contactName}</p>}
          {a.contactEmail && <p className="text-muted-foreground">{a.contactEmail}</p>}
          {a.contactPhone && <p className="text-muted-foreground">{a.contactPhone}</p>}
          {a.charges && a.charges.length > 0 && (
            <ul className="mt-2 space-y-1">
              {a.charges.map((c, i) => (
                <li key={i} className="flex items-center justify-between gap-2">
                  <span className="min-w-0 flex-1 truncate">{c.name}</span>
                  {c.annualValue && (
                    <span className="shrink-0 tabular-nums text-muted-foreground">
                      {c.annualValue}/yr
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </FactBlock>
    )
  }

  // Answerable kind but no facts found — be honest so staff know the draft has no data.
  return (
    <FactBlock title="No matching records found">
      <p className="text-sm text-muted-foreground text-pretty">
        The draft notes that we&apos;ll follow up — check the match is correct, or edit the reply
        before sending.
      </p>
    </FactBlock>
  )
}

function FactBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-3 rounded-md border border-primary/20 bg-background p-3">
      <p className="mb-2 text-xs font-medium text-muted-foreground">{title}</p>
      {children}
    </div>
  )
}

function StatusPill({ status }: { status: string }) {
  const s = status.toLowerCase()
  const tone =
    s === 'pass' || s === 'accepted'
      ? 'bg-primary/10 text-primary'
      : s === 'fail' || s === 'rejected'
        ? 'bg-destructive/10 text-destructive'
        : s === 'partial'
          ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400'
          : 'bg-muted text-muted-foreground'
  return (
    <span className={cn('shrink-0 rounded px-1.5 py-0.5 text-xs capitalize', tone)}>
      {status.replace(/_/g, ' ')}
    </span>
  )
}
