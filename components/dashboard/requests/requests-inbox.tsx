'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import {
  Mail,
  MapPin,
  Sparkles,
  Siren,
  RefreshCw,
  Check,
  X,
  CornerUpLeft,
  Clock,
  AlertTriangle,
  MailPlus,
} from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { AddRequestDialog } from './add-request-dialog'
import { ApproveCallDialog } from './approve-call-dialog'
import {
  retriageRequest,
  dismissRequest,
  reopenRequest,
  updateRequestMatch,
  sendAcknowledgement,
} from '@/lib/actions/inbound-requests'
import type {
  InboundRequest,
  InboundRequestUrgency,
  Site,
  ServiceType,
  SystemType,
  Profile,
} from '@/lib/types/database'

const NO_MATCH = '__none__'

// Email intake/reply is parked for now — the team triages via drag/drop (.eml/.msg)
// and manual paste instead. The inbound webhook + sendAcknowledgement action remain
// in the codebase; flip this to `true` to re-surface the outbound "Reply" UI.
const EMAIL_FEATURES_ENABLED: boolean = false

const URGENCY_META: Record<
  InboundRequestUrgency,
  { label: string; className: string }
> = {
  emergency: { label: 'Emergency', className: 'bg-destructive/10 text-destructive border-destructive/30' },
  high: { label: 'High', className: 'bg-amber-500/10 text-amber-700 border-amber-500/30 dark:text-amber-400' },
  normal: { label: 'Normal', className: 'bg-muted text-muted-foreground' },
  low: { label: 'Low', className: 'bg-muted text-muted-foreground' },
}

const INTENT_LABEL: Record<string, string> = {
  new_call: 'New call',
  chase_up: 'Chase-up',
  complaint: 'Complaint',
  quote_request: 'Quote request',
  general: 'General',
  unknown: 'Unknown',
}

type TabKey = 'review' | 'actioned' | 'dismissed'

export function RequestsInbox({
  requests,
  sites,
  clients,
  reactiveServiceTypes,
  systemTypes,
  engineers,
}: {
  requests: InboundRequest[]
  sites: Site[]
  clients: { id: string; name: string }[]
  reactiveServiceTypes: ServiceType[]
  systemTypes: SystemType[]
  engineers: Profile[]
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [tab, setTab] = useState<TabKey>('review')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [approveOpen, setApproveOpen] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [replyOpen, setReplyOpen] = useState(false)
  const [replyText, setReplyText] = useState('')
  const [droppedFile, setDroppedFile] = useState<File | null>(null)
  const [pageDragOver, setPageDragOver] = useState(false)
  const dragDepth = useRef(0)

  // Only react to drags that carry files (ignore text selections, etc.).
  function dragHasFiles(e: React.DragEvent) {
    return Array.from(e.dataTransfer.types).includes('Files')
  }

  function handlePageDragEnter(e: React.DragEvent) {
    if (!dragHasFiles(e)) return
    dragDepth.current += 1
    setPageDragOver(true)
  }

  function handlePageDragLeave(e: React.DragEvent) {
    if (!dragHasFiles(e)) return
    dragDepth.current -= 1
    if (dragDepth.current <= 0) {
      dragDepth.current = 0
      setPageDragOver(false)
    }
  }

  function handlePageDrop(e: React.DragEvent) {
    if (!dragHasFiles(e)) return
    e.preventDefault()
    dragDepth.current = 0
    setPageDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (file) setDroppedFile(file)
  }

  const siteById = useMemo(() => new Map(sites.map((s) => [s.id, s])), [sites])
  const clientById = useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients])
  const serviceById = useMemo(
    () => new Map(reactiveServiceTypes.map((s) => [s.id, s])),
    [reactiveServiceTypes],
  )
  const systemById = useMemo(() => new Map(systemTypes.map((s) => [s.id, s])), [systemTypes])

  const buckets = useMemo(() => {
    const review: InboundRequest[] = []
    const actioned: InboundRequest[] = []
    const dismissed: InboundRequest[] = []
    for (const r of requests) {
      if (r.status === 'actioned') actioned.push(r)
      else if (r.status === 'dismissed') dismissed.push(r)
      else review.push(r)
    }
    return { review, actioned, dismissed }
  }, [requests])

  const list = buckets[tab]
  const selected = useMemo(
    () => requests.find((r) => r.id === selectedId) ?? null,
    [requests, selectedId],
  )

  // Deep-link support: /dashboard/requests?request=<id> (used by the per-entity
  // "linked requests" cards) preselects that request and opens its correct tab.
  useEffect(() => {
    const requested = searchParams.get('request')
    if (!requested) return
    const match = requests.find((r) => r.id === requested)
    if (!match) return
    setSelectedId(requested)
    setTab(match.status === 'actioned' ? 'actioned' : match.status === 'dismissed' ? 'dismissed' : 'review')
  }, [searchParams, requests])

  async function withBusy(id: string, fn: () => Promise<void>) {
    setBusyId(id)
    try {
      await fn()
    } finally {
      setBusyId(null)
    }
  }

  async function handleRetriage(r: InboundRequest) {
    await withBusy(r.id, async () => {
      const res = await retriageRequest(r.id)
      if (!res.ok) toast.error(res.error ?? 'Triage failed.')
      else toast.success('Re-triaged.')
      router.refresh()
    })
  }

  async function handleDismiss(r: InboundRequest) {
    await withBusy(r.id, async () => {
      const res = await dismissRequest(r.id)
      if (!res.ok) toast.error(res.error ?? 'Could not dismiss.')
      else toast.success('Dismissed.')
      router.refresh()
    })
  }

  async function handleReopen(r: InboundRequest) {
    await withBusy(r.id, async () => {
      const res = await reopenRequest(r.id)
      if (!res.ok) toast.error(res.error ?? 'Could not re-open.')
      else toast.success('Re-opened.')
      router.refresh()
    })
  }

  async function handleMatchChange(
    r: InboundRequest,
    field: 'siteId' | 'clientId' | 'serviceTypeId' | 'systemTypeId',
    value: string,
  ) {
    const v = value === NO_MATCH ? null : value
    await withBusy(r.id, async () => {
      const res = await updateRequestMatch(r.id, { [field]: v })
      if (!res.ok) toast.error(res.error ?? 'Could not update match.')
      router.refresh()
    })
  }

  async function handleSendReply(r: InboundRequest) {
    await withBusy(r.id, async () => {
      const res = await sendAcknowledgement(r.id, replyText)
      if (!res.ok) toast.error(res.error ?? 'Could not send reply.')
      else {
        toast.success('Reply sent.')
        setReplyOpen(false)
      }
      router.refresh()
    })
  }

  function openReply(r: InboundRequest) {
    setReplyText(r.ai_reply_draft ?? '')
    setReplyOpen(true)
  }

  return (
    <div
      className="relative space-y-4"
      onDragEnter={handlePageDragEnter}
      onDragOver={(e) => {
        if (dragHasFiles(e)) e.preventDefault()
      }}
      onDragLeave={handlePageDragLeave}
      onDrop={handlePageDrop}
    >
      {pageDragOver && (
        <div className="pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-primary bg-background/85 backdrop-blur-sm">
          <MailPlus className="h-10 w-10 text-primary" />
          <p className="text-lg font-medium">Drop the email to triage it</p>
          <p className="text-sm text-muted-foreground">.eml or .msg files</p>
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)}>
          <TabsList>
            <TabsTrigger value="review">
              To review
              {buckets.review.length > 0 && (
                <Badge variant="secondary" className="ml-2">
                  {buckets.review.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="actioned">Actioned</TabsTrigger>
            <TabsTrigger value="dismissed">Dismissed</TabsTrigger>
          </TabsList>
        </Tabs>
        <AddRequestDialog
          fileToLoad={droppedFile}
          onFileConsumed={() => setDroppedFile(null)}
        />
      </div>

      {list.length === 0 ? (
        <Card className="flex flex-col items-center justify-center gap-2 p-12 text-center">
          <Mail className="h-8 w-8 text-muted-foreground" />
          <p className="font-medium">No requests here</p>
          <p className="text-sm text-muted-foreground text-pretty">
            {tab === 'review'
              ? 'Drag an email file (.eml or .msg) onto this page to triage it, or add one manually.'
              : 'Nothing in this list yet.'}
          </p>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
          {/* List */}
          <div className="flex flex-col gap-2">
            {list.map((r) => {
              const urgency = r.ai_urgency ? URGENCY_META[r.ai_urgency] : null
              const site = r.matched_site_id ? siteById.get(r.matched_site_id) : null
              const isSelected = r.id === selectedId
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setSelectedId(r.id)}
                  className={cn(
                    'w-full rounded-lg border p-3 text-left transition-colors hover:bg-muted/50',
                    isSelected && 'border-primary bg-primary/[0.04]',
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="line-clamp-1 font-medium">
                      {r.subject || r.from_name || r.from_email || 'Untitled request'}
                    </span>
                    {urgency && (
                      <Badge variant="outline" className={cn('shrink-0 text-xs', urgency.className)}>
                        {r.ai_urgency === 'emergency' && <Siren className="mr-1 h-3 w-3" />}
                        {urgency.label}
                      </Badge>
                    )}
                  </div>
                  <p className="mt-1 line-clamp-2 text-sm text-muted-foreground text-pretty">
                    {r.ai_summary || r.body_text?.slice(0, 140) || 'No preview'}
                  </p>
                  <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                    {site ? (
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        {site.name}
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-amber-600 dark:text-amber-500">
                        <AlertTriangle className="h-3 w-3" />
                        No site match
                      </span>
                    )}
                    {r.ai_intent && <span>· {INTENT_LABEL[r.ai_intent] ?? r.ai_intent}</span>}
                  </div>
                </button>
              )
            })}
          </div>

          {/* Detail */}
          <div>
            {selected ? (
              <RequestDetail
                key={selected.id}
                request={selected}
                busy={busyId === selected.id}
                sites={sites}
                clients={clients}
                reactiveServiceTypes={reactiveServiceTypes}
                systemTypes={systemTypes}
                replyOpen={replyOpen}
                replyText={replyText}
                onReplyTextChange={setReplyText}
                onOpenReply={() => openReply(selected)}
                onCancelReply={() => setReplyOpen(false)}
                onSendReply={() => handleSendReply(selected)}
                onRetriage={() => handleRetriage(selected)}
                onDismiss={() => handleDismiss(selected)}
                onReopen={() => handleReopen(selected)}
                onApprove={() => setApproveOpen(true)}
                onMatchChange={(field, value) => handleMatchChange(selected, field, value)}
              />
            ) : (
              <Card className="flex h-full min-h-64 items-center justify-center p-8 text-center text-sm text-muted-foreground">
                Select a request to see the details and suggested actions.
              </Card>
            )}
          </div>
        </div>
      )}

      {selected && (
        <ApproveCallDialog
          open={approveOpen}
          onOpenChange={setApproveOpen}
          request={selected}
          sites={sites}
          clients={clients}
          reactiveServiceTypes={reactiveServiceTypes}
          systemTypes={systemTypes}
          engineers={engineers}
        />
      )}
    </div>
  )
}

function RequestDetail({
  request: r,
  busy,
  sites,
  clients,
  reactiveServiceTypes,
  systemTypes,
  replyOpen,
  replyText,
  onReplyTextChange,
  onOpenReply,
  onCancelReply,
  onSendReply,
  onRetriage,
  onDismiss,
  onReopen,
  onApprove,
  onMatchChange,
}: {
  request: InboundRequest
  busy: boolean
  sites: Site[]
  clients: { id: string; name: string }[]
  reactiveServiceTypes: ServiceType[]
  systemTypes: SystemType[]
  replyOpen: boolean
  replyText: string
  onReplyTextChange: (v: string) => void
  onOpenReply: () => void
  onCancelReply: () => void
  onSendReply: () => void
  onRetriage: () => void
  onDismiss: () => void
  onReopen: () => void
  onApprove: () => void
  onMatchChange: (
    field: 'siteId' | 'clientId' | 'serviceTypeId' | 'systemTypeId',
    value: string,
  ) => void
}) {
  const urgency = r.ai_urgency ? URGENCY_META[r.ai_urgency] : null
  const isClosed = r.status === 'actioned' || r.status === 'dismissed'

  return (
    <Card className="p-5">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-balance">
            {r.subject || 'Untitled request'}
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            From {r.from_name || 'Unknown'}
            {r.from_email ? ` <${r.from_email}>` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {urgency && (
            <Badge variant="outline" className={cn(urgency.className)}>
              {r.ai_urgency === 'emergency' && <Siren className="mr-1 h-3 w-3" />}
              {urgency.label}
            </Badge>
          )}
          {r.status === 'actioned' && (
            <Badge variant="outline" className="border-primary/30 bg-primary/10 text-primary">
              Actioned
            </Badge>
          )}
          {r.status === 'dismissed' && <Badge variant="secondary">Dismissed</Badge>}
        </div>
      </div>

      {/* Triage error */}
      {r.triage_error && (
        <div className="mt-4 flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>Triage failed: {r.triage_error}</span>
        </div>
      )}

      {/* AI summary */}
      {r.ai_summary && (
        <div className="mt-4 rounded-md border bg-muted/40 p-3">
          <p className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5" />
            AI summary
            {r.ai_intent && <span>· {INTENT_LABEL[r.ai_intent] ?? r.ai_intent}</span>}
          </p>
          <p className="text-sm text-pretty">{r.ai_summary}</p>
        </div>
      )}

      {/* Matched fields (editable) */}
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label className="text-xs text-muted-foreground">Site</Label>
          <Select
            value={r.matched_site_id ?? NO_MATCH}
            onValueChange={(v) => onMatchChange('siteId', v)}
            disabled={busy || isClosed}
          >
            <SelectTrigger>
              <SelectValue placeholder="No match" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_MATCH}>No match</SelectItem>
              {sites.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                  {s.postcode ? ` — ${s.postcode}` : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-1.5">
          <Label className="text-xs text-muted-foreground">Client</Label>
          <Select
            value={r.matched_client_id ?? NO_MATCH}
            onValueChange={(v) => onMatchChange('clientId', v)}
            disabled={busy || isClosed}
          >
            <SelectTrigger>
              <SelectValue placeholder="No match" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_MATCH}>No match</SelectItem>
              {clients.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-1.5">
          <Label className="text-xs text-muted-foreground">Suggested call type</Label>
          <Select
            value={r.matched_service_type_id ?? NO_MATCH}
            onValueChange={(v) => onMatchChange('serviceTypeId', v)}
            disabled={busy || isClosed}
          >
            <SelectTrigger>
              <SelectValue placeholder="None" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_MATCH}>None</SelectItem>
              {reactiveServiceTypes.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-1.5">
          <Label className="text-xs text-muted-foreground">System</Label>
          <Select
            value={r.matched_system_type_id ?? NO_MATCH}
            onValueChange={(v) => onMatchChange('systemTypeId', v)}
            disabled={busy || isClosed}
          >
            <SelectTrigger>
              <SelectValue placeholder="None" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_MATCH}>None</SelectItem>
              {systemTypes.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.code ? `${s.code} — ${s.name}` : s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Original email */}
      <details className="mt-4 rounded-md border">
        <summary className="cursor-pointer select-none px-3 py-2 text-sm font-medium">
          Original message
        </summary>
        <div className="max-h-64 overflow-y-auto whitespace-pre-wrap px-3 pb-3 text-sm text-muted-foreground">
          {r.body_text || 'No content.'}
        </div>
      </details>

      {/* Reply editor */}
      {EMAIL_FEATURES_ENABLED && replyOpen && (
        <div className="mt-4 grid gap-2 rounded-md border p-3">
          <Label htmlFor="reply-text" className="text-sm font-medium">
            Reply to sender
          </Label>
          <Textarea
            id="reply-text"
            value={replyText}
            onChange={(e) => onReplyTextChange(e.target.value)}
            rows={6}
          />
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={onCancelReply} disabled={busy}>
              Cancel
            </Button>
            <Button size="sm" onClick={onSendReply} disabled={busy}>
              Send reply
            </Button>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="mt-5 flex flex-wrap gap-2 border-t pt-4">
        {!isClosed ? (
          <>
            <Button onClick={onApprove} disabled={busy}>
              <Check className="h-4 w-4" />
              Create call
            </Button>
            {EMAIL_FEATURES_ENABLED && r.from_email && !replyOpen && (
              <Button variant="outline" onClick={onOpenReply} disabled={busy}>
                <CornerUpLeft className="h-4 w-4" />
                Reply
              </Button>
            )}
            <Button variant="outline" onClick={onRetriage} disabled={busy}>
              <RefreshCw className={cn('h-4 w-4', busy && 'animate-spin')} />
              Re-triage
            </Button>
            <Button variant="ghost" onClick={onDismiss} disabled={busy}>
              <X className="h-4 w-4" />
              Dismiss
            </Button>
          </>
        ) : (
          <>
            {r.created_task_id && (
              <Button variant="outline" asChild>
                <a href={`/dashboard/tasks/${r.created_task_id}`}>
                  <Clock className="h-4 w-4" />
                  View call
                </a>
              </Button>
            )}
            <Button variant="ghost" onClick={onReopen} disabled={busy}>
              <CornerUpLeft className="h-4 w-4" />
              Re-open
            </Button>
          </>
        )}
      </div>
    </Card>
  )
}
