'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  Sparkles,
  Loader2,
  RefreshCw,
  CalendarPlus,
  FileSignature,
  PhoneCall,
  Save,
  Plus,
  Trash2,
  AlertTriangle,
  Check,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { prepareAction, saveActionDraft } from '@/lib/actions/inbound-requests'
import type {
  InboundRequest,
  InboundRequestUrgency,
  PreparedQuoteLine,
  SuggestedActionKind,
} from '@/lib/types/database'

// Only these kinds render as a prepared "action" card. reply/send_report are
// covered by the answer card; dismiss needs no preparation.
const ACTION_META: Partial<
  Record<
    SuggestedActionKind,
    { label: string; confirm: string; Icon: React.ComponentType<{ className?: string }> }
  >
> = {
  create_call: { label: 'Book a reactive call', confirm: 'Review & book call', Icon: CalendarPlus },
  create_quote: { label: 'Prepare a quote', confirm: 'Create draft quote', Icon: FileSignature },
  chase_up: { label: 'Log a chase-up', confirm: 'Log chase-up', Icon: PhoneCall },
}

const URGENCY_OPTIONS: { value: InboundRequestUrgency; label: string }[] = [
  { value: 'emergency', label: 'Emergency' },
  { value: 'high', label: 'High' },
  { value: 'normal', label: 'Normal' },
  { value: 'low', label: 'Low' },
]

export function PreparedActionCard({
  request: r,
  executing,
  disabled,
  onConfirm,
}: {
  request: InboundRequest
  executing: boolean
  disabled?: boolean
  // Runs the existing execute path (opens the call dialog / creates the quote /
  // logs the chase-up). The card only prepares + edits params; confirm delegates.
  onConfirm: (kind: SuggestedActionKind) => void
}) {
  const router = useRouter()
  const prepared = !!r.action_prepared_at
  const isClosed = r.status === 'actioned' || r.status === 'dismissed'
  const primary = r.suggested_actions?.[0]
  const kind = primary?.kind
  const meta = kind ? ACTION_META[kind] : undefined
  const payload = primary?.payload ?? {}

  // Editable local copies of the drafted params.
  const [notes, setNotes] = useState(payload.notes ?? '')
  const [urgency, setUrgency] = useState<InboundRequestUrgency>(payload.urgency ?? 'normal')
  const [note, setNote] = useState(payload.note ?? '')
  const [title, setTitle] = useState(payload.title ?? '')
  const [summary, setSummary] = useState(payload.summary ?? '')
  const [lines, setLines] = useState<PreparedQuoteLine[]>(
    Array.isArray(payload.quoteLines) ? payload.quoteLines : [],
  )
  const [preparing, setPreparing] = useState(false)
  const [saving, setSaving] = useState(false)

  const canPrepare = !!r.matched_site_id || !!r.matched_client_id
  const callNeedsSite = kind === 'create_call' && !r.matched_site_id

  async function handlePrepare() {
    setPreparing(true)
    try {
      const res = await prepareAction(r.id)
      if (!res.ok) toast.error(res.error ?? 'Could not prepare an action.')
      else toast.success('Action prepared.')
      router.refresh()
    } finally {
      setPreparing(false)
    }
  }

  function currentPatch() {
    return kind === 'create_call'
      ? { notes: notes.trim(), urgency }
      : kind === 'chase_up'
        ? { note: note.trim() }
        : {
            title: title.trim(),
            summary: summary.trim(),
            quoteLines: lines.filter((l) => l.description.trim()),
          }
  }

  async function handleSave() {
    if (!kind) return
    setSaving(true)
    try {
      const res = await saveActionDraft(r.id, currentPatch())
      if (!res.ok) toast.error(res.error ?? 'Could not save.')
      else toast.success('Saved.')
      router.refresh()
    } finally {
      setSaving(false)
    }
  }

  // Persist the current (possibly edited) fields, then run the execute path so
  // the booking dialog / quote / chase-up always uses exactly what's on screen.
  async function handleConfirm() {
    if (!kind) return
    setSaving(true)
    try {
      await saveActionDraft(r.id, currentPatch())
      // Refresh so the parent's `selected` payload reflects the saved edits before
      // the booking dialog reads them (the awaited execute call below covers the lag).
      router.refresh()
    } finally {
      setSaving(false)
    }
    onConfirm(kind)
  }

  // Not prepared yet: offer a Prepare button when there's something to work with.
  if (!prepared || !kind || !meta) {
    if (isClosed || !canPrepare) return null
    // Only offer preparation for actionable intents.
    const actionable =
      r.ai_intent === 'new_call' ||
      r.ai_intent === 'complaint' ||
      r.ai_intent === 'quote_request' ||
      r.ai_intent === 'chase_up'
    if (!actionable) return null
    return (
      <div className="mt-4 rounded-lg border border-dashed p-4">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <p className="text-sm font-medium">Prepare the action</p>
        </div>
        <p className="mt-1 text-xs text-muted-foreground text-pretty">
          Let AI draft the booking, quote or chase-up from this request&apos;s details. You review
          and confirm before anything is created.
        </p>
        <Button size="sm" className="mt-3" onClick={handlePrepare} disabled={preparing || disabled}>
          {preparing ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Sparkles className="h-3.5 w-3.5" />
          )}
          Prepare action
        </Button>
      </div>
    )
  }

  return (
    <div className="mt-4 rounded-lg border border-primary/25 bg-primary/[0.04] p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-primary">
          <Sparkles className="h-3.5 w-3.5" />
          AI-prepared action
        </p>
        <Badge variant="outline" className="gap-1 border-primary/30 text-primary">
          <meta.Icon className="h-3 w-3" />
          {meta.label}
        </Badge>
        {isClosed && (
          <Badge variant="outline" className="ml-auto gap-1 border-primary/30 bg-primary/10 text-primary">
            <Check className="h-3 w-3" />
            Done
          </Badge>
        )}
      </div>

      {/* Per-kind editable parameters */}
      {kind === 'create_call' && (
        <div className="grid gap-3">
          <div className="grid gap-1.5 sm:max-w-[12rem]">
            <Label className="text-xs text-muted-foreground">Urgency</Label>
            <Select
              value={urgency}
              onValueChange={(v) => setUrgency(v as InboundRequestUrgency)}
              disabled={isClosed}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {URGENCY_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`act-notes-${r.id}`} className="text-xs text-muted-foreground">
              Booking notes for the engineer
            </Label>
            <Textarea
              id={`act-notes-${r.id}`}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
              disabled={isClosed}
              className="resize-y"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            You&apos;ll pick the date and engineer in the next step before the call is created.
          </p>
        </div>
      )}

      {kind === 'chase_up' && (
        <div className="grid gap-1.5">
          <Label htmlFor={`act-note-${r.id}`} className="text-xs text-muted-foreground">
            Chase-up note
          </Label>
          <Textarea
            id={`act-note-${r.id}`}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            disabled={isClosed}
            className="resize-y"
          />
        </div>
      )}

      {kind === 'create_quote' && (
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor={`act-title-${r.id}`} className="text-xs text-muted-foreground">
              Quote title
            </Label>
            <Input
              id={`act-title-${r.id}`}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={isClosed}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`act-summary-${r.id}`} className="text-xs text-muted-foreground">
              Scope of works
            </Label>
            <Textarea
              id={`act-summary-${r.id}`}
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              rows={3}
              disabled={isClosed}
              className="resize-y"
            />
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs text-muted-foreground">
              Suggested line items{' '}
              <span className="font-normal">(you price these in the builder)</span>
            </Label>
            <div className="rounded-md border bg-background">
              {lines.length === 0 ? (
                <p className="px-3 py-3 text-sm text-muted-foreground">
                  No line items suggested — add some or price from scratch in the builder.
                </p>
              ) : (
                <ul className="divide-y">
                  {lines.map((line, i) => (
                    <li key={i} className="flex items-center gap-2 p-2">
                      <Input
                        aria-label="Line description"
                        value={line.description}
                        onChange={(e) =>
                          setLines((prev) =>
                            prev.map((l, j) =>
                              j === i ? { ...l, description: e.target.value } : l,
                            ),
                          )
                        }
                        disabled={isClosed}
                        className="min-w-0 flex-1"
                      />
                      <Input
                        aria-label="Quantity"
                        type="number"
                        min={1}
                        value={line.quantity}
                        onChange={(e) =>
                          setLines((prev) =>
                            prev.map((l, j) =>
                              j === i
                                ? { ...l, quantity: Math.max(1, Number(e.target.value) || 1) }
                                : l,
                            ),
                          )
                        }
                        disabled={isClosed}
                        className="w-16 shrink-0 tabular-nums"
                      />
                      {!isClosed && (
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                          onClick={() => setLines((prev) => prev.filter((_, j) => j !== i))}
                          aria-label="Remove line"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {!isClosed && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="justify-self-start"
                onClick={() =>
                  setLines((prev) => [...prev, { description: '', quantity: 1, unitPricePounds: null }])
                }
              >
                <Plus className="h-3.5 w-3.5" />
                Add line
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Actions */}
      {!isClosed && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            disabled={executing || disabled || saving || preparing || callNeedsSite}
            onClick={handleConfirm}
          >
            {executing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <meta.Icon className="h-3.5 w-3.5" />
            )}
            {meta.confirm}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={handleSave}
            disabled={saving || executing || disabled || preparing}
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            Save changes
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={handlePrepare}
            disabled={preparing || saving || executing || disabled}
            className="ml-auto"
          >
            {preparing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            Regenerate
          </Button>
        </div>
      )}

      {callNeedsSite && (
        <p className="mt-2 flex items-center gap-1 text-xs text-amber-600 dark:text-amber-500">
          <AlertTriangle className="h-3 w-3" />
          Match a site below before booking the call.
        </p>
      )}
      {!isClosed && (
        <p className="mt-2 text-xs text-muted-foreground">
          Nothing is created until you confirm. &ldquo;Save changes&rdquo; keeps your edits for
          later.
        </p>
      )}
    </div>
  )
}
