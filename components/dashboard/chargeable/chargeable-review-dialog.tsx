'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Separator } from '@/components/ui/separator'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  CheckCircle2,
  Circle,
  AlertTriangle,
  Clock,
  Coins,
  FileText,
  Send,
  Loader2,
  Mail,
  Ban,
  Receipt,
  ArrowLeft,
  ChevronRight,
  X,
  Plus,
} from 'lucide-react'
import { formatDateUK } from '@/lib/utils'
import {
  setChargeReview,
  markReviewedAndClose,
  submitForInvoicing,
} from '@/lib/actions/charge-review'
import {
  addPoRequest,
  sendPoRequestEmail,
  getPoRequestPreview,
} from '@/lib/actions/po-requests'
import { CallPartsPicker } from '@/components/dashboard/tasks/call-parts-picker'
import { CallChargesEditor } from '@/components/dashboard/chargeable/call-charges-editor'
import {
  buildPoRequestEmailHtml,
  type PoRequestEmailContent,
} from '@/lib/email/po-request-template'
import type { ChargeableCall } from '@/components/dashboard/chargeable/chargeable-calls-table'

function formatGBP(pence: number): string {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(pence / 100)
}

// Reasons an engineer/office can give for missing the response KPI deadline.
const DEADLINE_REASONS = [
  'No access to site',
  'Awaiting parts',
  'Awaiting client authorisation',
  'Resource / engineer availability',
  'Weather / access conditions',
  'Additional works discovered on site',
  'Other',
]

interface PoPreview {
  recipients: string[]
  siteName: string
  clientName: string | null
  contactName: string | null
  serviceName: string
  systemName: string | null
  panelName: string | null
  referenceNumber: string | null
  completedAt: string | null
  clientRef: string | null
  engineerNotes: string | null
  parts: { name: string; quantity: number; unitCostPence: number }[]
  partsTotalPence: number
  priorRequests: PoRequestEmailContent['priorRequests']
  companyName: string
  baseUrl: string
}

/** A single gated checklist point in the review. */
function GatePoint({
  done,
  required,
  label,
  children,
}: {
  done: boolean
  required: boolean
  label: string
  children?: React.ReactNode
}) {
  return (
    <div className="flex gap-3">
      <div className="mt-0.5 shrink-0">
        {done ? (
          <CheckCircle2 className="h-5 w-5 text-emerald-600" />
        ) : required ? (
          <Circle className="h-5 w-5 text-amber-500" />
        ) : (
          <Circle className="h-5 w-5 text-muted-foreground/40" />
        )}
      </div>
      <div className="flex-1 space-y-2">
        <p className="text-sm font-medium leading-5">{label}</p>
        {children}
      </div>
    </div>
  )
}

export function ChargeableReviewDialog({
  call,
  open,
  onOpenChange,
}: {
  call: ChargeableCall
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  // Local editable state seeded from the call (server is source of truth on refresh).
  const [chargeable, setChargeableState] = useState(call.chargeable)
  const [deadlineReason, setDeadlineReason] = useState(call.deadlineFailedReason ?? '')
  const [deadlineNote, setDeadlineNote] = useState(call.deadlineFailedNote ?? '')
  const [clientRef, setClientRefState] = useState(call.clientRef ?? '')
  const [poNotRequired, setPoNotRequired] = useState(call.poNotRequired)
  const [busy, setBusy] = useState<string | null>(null)

  // PO email preview sub-flow
  const [poView, setPoView] = useState<'idle' | 'preview' | 'sent'>('idle')
  const [preview, setPreview] = useState<PoPreview | null>(null)
  const [specialNote, setSpecialNote] = useState('')
  // Editable recipient list — seeded from the site/client contacts, but the
  // reviewer can remove or add addresses (e.g. when a contact is away and the
  // client provides an alternate email).
  const [recipients, setRecipients] = useState<string[]>([])
  const [newRecipient, setNewRecipient] = useState('')

  const authorisedPo = useMemo(
    () => call.poRequests.find((r) => !!r.authorised_at && r.po_number),
    [call.poRequests],
  )

  // Render the actual email HTML for the in-dialog preview. Rebuilds live as the
  // reviewer edits the optional message. The authorisation token is a placeholder
  // here — the real per-request token is generated when the email is sent.
  const previewHtml = useMemo(() => {
    if (!preview) return ''
    return buildPoRequestEmailHtml({
      siteName: preview.siteName,
      clientName: preview.clientName,
      contactName: preview.contactName,
      serviceName: preview.serviceName,
      systemName: preview.systemName,
      panelName: preview.panelName,
      referenceNumber: preview.referenceNumber,
      completedAt: preview.completedAt,
      clientRef: preview.clientRef,
      engineerNotes: preview.engineerNotes,
      parts: preview.parts,
      partsTotalPence: preview.partsTotalPence,
      specialNote: specialNote.trim() || null,
      priorRequests: preview.priorRequests,
      authorisationToken: 'PREVIEW-LINK',
      companyName: preview.companyName,
      baseUrl: preview.baseUrl,
    })
  }, [preview, specialNote])

  // ---- Gates (mirror server computeGates) ----
  const deadlineReasonSatisfied = !call.missedDeadline || !!deadlineReason.trim()
  const poRequired = call.clientRequiresPo && !poNotRequired
  const poSatisfied = !poRequired || !!clientRef.trim()

  const canMarkReviewed = deadlineReasonSatisfied // non-chargeable close
  const canSubmitInvoicing = chargeable && deadlineReasonSatisfied && poSatisfied

  const run = (key: string, fn: () => Promise<{ error: string | null }>, successMsg: string) => {
    setBusy(key)
    startTransition(async () => {
      const { error } = await fn()
      setBusy(null)
      if (error) {
        toast.error(error)
      } else {
        toast.success(successMsg)
        router.refresh()
      }
    })
  }

  const saveDeadlineReason = () => {
    if (!deadlineReason.trim()) return
    run(
      'deadline',
      () =>
        setChargeReview(call.id, {
          kind: 'set_deadline_failed',
          reason: deadlineReason.trim(),
          note: deadlineNote.trim() || null,
        }),
      'Deadline reason saved',
    )
  }

  const toggleChargeable = (value: boolean) => {
    setChargeableState(value)
    run('chargeable', () => setChargeReview(call.id, { kind: 'set_chargeable', chargeable: value }), value ? 'Marked chargeable' : 'Marked not chargeable')
  }

  const saveClientRef = () => {
    run('clientref', () => setChargeReview(call.id, { kind: 'set_client_ref', clientRef: clientRef.trim() || null }), 'PO / client ref saved')
  }

  const acceptAuthorisedPo = () => {
    if (!authorisedPo?.po_number) return
    setClientRefState(authorisedPo.po_number)
    run('acceptpo', () => setChargeReview(call.id, { kind: 'set_client_ref', clientRef: authorisedPo.po_number }), 'Authorised PO applied')
  }

  const toggleNotRequired = (value: boolean) => {
    setPoNotRequired(value)
    run('notreq', () => setChargeReview(call.id, { kind: 'set_po_not_required', value }), value ? 'PO marked not required' : 'PO requirement restored')
  }

  const openPoPreview = () => {
    setBusy('preview')
    startTransition(async () => {
      const { error, data } = await getPoRequestPreview(call.id)
      setBusy(null)
      if (error || !data) {
        toast.error(error ?? 'Could not build preview')
        return
      }
      setPreview(data)
      setRecipients(data.recipients)
      setNewRecipient('')
      setPoView('preview')
    })
  }

  const isValidEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())

  const addRecipient = () => {
    const value = newRecipient.trim().toLowerCase()
    if (!isValidEmail(value)) {
      toast.error('Enter a valid email address')
      return
    }
    if (recipients.some((r) => r.toLowerCase() === value)) {
      toast.error('That address is already in the list')
      return
    }
    setRecipients((prev) => [...prev, newRecipient.trim()])
    setNewRecipient('')
  }

  const removeRecipient = (email: string) => {
    setRecipients((prev) => prev.filter((r) => r !== email))
  }

  const confirmSendPo = () => {
    setBusy('sendpo')
    startTransition(async () => {
      // Log a request entry, then send the email against it.
      const { error: addErr, id } = await addPoRequest(call.id, null)
      if (addErr || !id) {
        setBusy(null)
        toast.error(addErr ?? 'Could not log PO request')
        return
      }
      const { error } = await sendPoRequestEmail(
        id,
        call.id,
        specialNote.trim() || null,
        recipients,
      )
      setBusy(null)
      if (error) {
        toast.error(error)
        return
      }
      setPoView('sent')
      toast.success('PO request email sent')
      router.refresh()
    })
  }

  const closeReviewed = () => {
    run('reviewed', () => markReviewedAndClose(call.id), 'Reviewed and closed')
    onOpenChange(false)
  }

  const submitInvoicing = () => {
    run('invoice', () => submitForInvoicing(call.id), 'Submitted for invoicing')
    onOpenChange(false)
  }

  const busyAny = isPending || busy !== null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] gap-0 overflow-y-auto p-0 sm:max-w-2xl">
        <DialogHeader className="border-b px-6 py-4">
          <DialogTitle className="flex items-center gap-2">
            <Coins className="h-5 w-5 text-amber-600" />
            Review chargeable call
          </DialogTitle>
          <DialogDescription>
            Resolve every point below before closing. {call.referenceNumber}
          </DialogDescription>
        </DialogHeader>

        {/* PO email preview takes over the body when active */}
        {poView !== 'idle' ? (
          <div className="space-y-4 px-6 py-5">
            {poView === 'sent' ? (
              <div className="flex flex-col items-center gap-3 py-8 text-center">
                <CheckCircle2 className="h-12 w-12 text-emerald-600" />
                <p className="font-medium">PO request email sent</p>
                <p className="max-w-sm text-sm text-muted-foreground">
                  The client will receive a link to enter their PO number. When they authorise it,
                  this call will be flagged ready to re-review.
                </p>
                <Button onClick={() => { setPoView('idle'); onOpenChange(false) }}>Done</Button>
              </div>
            ) : (
              <>
                <button
                  onClick={() => setPoView('idle')}
                  className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Back to review
                </button>
                <div className="rounded-lg border bg-muted/20 p-4">
                  <p className="mb-1 text-sm font-semibold">This email will be sent to:</p>
                  <p className="mb-3 text-xs text-muted-foreground">
                    Remove or add addresses as needed — e.g. if the usual contact is away and the
                    client has given an alternate email.
                  </p>
                  {recipients.length > 0 ? (
                    <div className="mb-3 flex flex-wrap gap-1.5">
                      {recipients.map((r) => (
                        <Badge key={r} variant="secondary" className="gap-1 pr-1">
                          <Mail className="h-3 w-3" />
                          {r}
                          <button
                            type="button"
                            onClick={() => removeRecipient(r)}
                            disabled={busyAny}
                            aria-label={`Remove ${r}`}
                            className="ml-0.5 rounded-full p-0.5 hover:bg-muted-foreground/20 disabled:opacity-50"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </Badge>
                      ))}
                    </div>
                  ) : (
                    <div className="mb-3 flex items-center gap-2 text-sm text-destructive">
                      <AlertTriangle className="h-4 w-4" />
                      No recipients — add at least one email address below.
                    </div>
                  )}
                  <div className="flex gap-2">
                    <Input
                      type="email"
                      value={newRecipient}
                      onChange={(e) => setNewRecipient(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                          e.preventDefault()
                          addRecipient()
                        }
                      }}
                      placeholder="Add another email address…"
                      disabled={busyAny}
                      className="h-9"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={addRecipient}
                      disabled={busyAny || !newRecipient.trim()}
                      className="gap-1.5"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Add
                    </Button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="po-special-note">Message to client (optional)</Label>
                  <Textarea
                    id="po-special-note"
                    value={specialNote}
                    onChange={(e) => setSpecialNote(e.target.value)}
                    placeholder="Any specific message to include in this request…"
                    rows={3}
                  />
                  <p className="text-xs text-muted-foreground">
                    Your message appears in the highlighted note box within the email below.
                  </p>
                </div>

                {preview && (
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-1.5">
                      <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                      <p className="text-sm font-medium">Email preview</p>
                    </div>
                    <div className="overflow-hidden rounded-lg border bg-muted/30">
                      <iframe
                        title="PO request email preview"
                        srcDoc={previewHtml}
                        sandbox=""
                        className="h-[420px] w-full border-0 bg-white"
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      This is a preview. The &quot;Authorise&quot; button links to a unique,
                      secure page generated when the request is sent.
                    </p>
                  </div>
                )}

                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setPoView('idle')} disabled={busyAny}>
                    Cancel
                  </Button>
                  <Button
                    className="gap-2 bg-blue-600 hover:bg-blue-700"
                    onClick={confirmSendPo}
                    disabled={busyAny || !preview || recipients.length === 0}
                  >
                    {busy === 'sendpo' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    Send request
                  </Button>
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="space-y-5 px-6 py-5">
            {/* 1. Call summary */}
            <section className="rounded-lg border bg-muted/20 p-4">
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <div>
                  <dt className="text-xs text-muted-foreground">Site</dt>
                  <dd className="font-medium">{call.siteName}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Client</dt>
                  <dd className="font-medium">{call.clientName || '—'}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Service</dt>
                  <dd className="font-medium">{call.serviceName}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Completed</dt>
                  <dd className="font-medium">{call.completedAt ? formatDateUK(call.completedAt) : '—'}</dd>
                </div>
                {call.systemName && (
                  <div>
                    <dt className="text-xs text-muted-foreground">System</dt>
                    <dd className="font-medium">{call.systemName}</dd>
                  </div>
                )}
                {call.panelName && (
                  <div>
                    <dt className="text-xs text-muted-foreground">Panel(s)</dt>
                    <dd className="font-medium">{call.panelName}</dd>
                  </div>
                )}
                <div>
                  <dt className="text-xs text-muted-foreground">Engineer</dt>
                  <dd className="font-medium">{call.engineerName}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Total to be invoiced</dt>
                  <dd className="font-semibold text-base">{formatGBP(call.partsTotalPence)}</dd>
                </div>
              </dl>
            </section>

            {/* 2. Missed deadline reason */}
            <GatePoint
              done={deadlineReasonSatisfied}
              required={call.missedDeadline}
              label={
                call.missedDeadline
                  ? 'Reason for missing the response deadline'
                  : 'Response deadline met'
              }
            >
              {call.missedDeadline ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-xs text-amber-800">
                    <Clock className="h-3.5 w-3.5" />
                    Completed after the KPI deadline
                    {call.respondBy && <> (due {formatDateUK(call.respondBy)})</>}
                  </div>
                  <Select value={deadlineReason} onValueChange={setDeadlineReason}>
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Select a reason…" />
                    </SelectTrigger>
                    <SelectContent>
                      {DEADLINE_REASONS.map((r) => (
                        <SelectItem key={r} value={r}>
                          {r}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Textarea
                    value={deadlineNote}
                    onChange={(e) => setDeadlineNote(e.target.value)}
                    placeholder="Optional detail…"
                    rows={2}
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={saveDeadlineReason}
                    disabled={busyAny || !deadlineReason.trim()}
                  >
                    {busy === 'deadline' ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : null}
                    Save reason
                  </Button>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  This call was completed within its response KPI — no reason needed.
                </p>
              )}
            </GatePoint>

            <Separator />

            {/* 3. Chargeable decision */}
            <GatePoint done label="Is this call chargeable?" required>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant={chargeable ? 'default' : 'outline'}
                  className={chargeable ? 'gap-1.5' : 'gap-1.5'}
                  onClick={() => toggleChargeable(true)}
                  disabled={busyAny}
                >
                  <Coins className="h-3.5 w-3.5" />
                  Chargeable
                </Button>
                <Button
                  size="sm"
                  variant={!chargeable ? 'default' : 'outline'}
                  onClick={() => toggleChargeable(false)}
                  disabled={busyAny}
                  className="gap-1.5"
                >
                  <Ban className="h-3.5 w-3.5" />
                  Not chargeable
                </Button>
              </div>
            </GatePoint>

            {/* 3b. Parts + ad-hoc charges (editable at review; office/admin). RLS
                lets is_staff() manage call_parts/call_charges at any status, so a
                completed call under review can have parts corrected and extra
                labour/sundries added. Both flow into the generated invoice. */}
            {chargeable && (
              <>
                <Separator />
                <div className="space-y-3">
                  <p className="text-sm font-medium leading-5">Parts &amp; charges to invoice</p>
                  <CallPartsPicker taskId={call.id} canEdit />
                  <CallChargesEditor
                    taskId={call.id}
                    canEdit
                    onChanged={() => router.refresh()}
                  />
                </div>
              </>
            )}

            {/* 4. Follow-up status */}
            <Separator />
            <GatePoint done label="Follow-up" required={false}>
              {call.followUpLogged ? (
                <div className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs text-emerald-800">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  A follow-up has been logged for this call.
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  No follow-up logged. If further works are required, raise one from the call page.
                </p>
              )}
            </GatePoint>

            {/* 5. PO section (only when chargeable) */}
            {chargeable && (
              <>
                <Separator />
                <GatePoint
                  done={poSatisfied}
                  required={poRequired}
                  label={
                    poRequired
                      ? 'Purchase order (required by this client)'
                      : 'Purchase order (not required by this client)'
                  }
                >
                  {call.poAutoAuthorised && (
                    <div className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                      PO <strong>{call.clientRef || '—'}</strong> was auto-imported from this
                      site/system&apos;s authorised-works authorisation, so no PO request is needed.
                    </div>
                  )}

                  {authorisedPo?.po_number && !clientRef.trim() && (
                    <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm">
                      <span className="text-emerald-800">
                        Client authorised PO <strong>{authorisedPo.po_number}</strong>
                        {authorisedPo.authorised_by_name && <> · {authorisedPo.authorised_by_name}</>}
                      </span>
                      <Button size="sm" className="h-7 gap-1.5 bg-emerald-600 hover:bg-emerald-700" onClick={acceptAuthorisedPo} disabled={busyAny}>
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Use this PO
                      </Button>
                    </div>
                  )}

                  <div className="flex items-center gap-1.5">
                    <Input
                      value={clientRef}
                      onChange={(e) => setClientRefState(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.nativeEvent.isComposing) saveClientRef()
                      }}
                      placeholder="Enter PO / client ref"
                      className="h-9"
                      disabled={busyAny || poNotRequired}
                    />
                    <Button size="sm" variant="outline" onClick={saveClientRef} disabled={busyAny || poNotRequired}>
                      {busy === 'clientref' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Save'}
                    </Button>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5"
                      onClick={openPoPreview}
                      disabled={busyAny}
                    >
                      {busy === 'preview' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}
                      Request PO by email
                    </Button>
                    <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
                      <input
                        type="checkbox"
                        checked={poNotRequired}
                        onChange={(e) => toggleNotRequired(e.target.checked)}
                        disabled={busyAny}
                        className="h-3.5 w-3.5 rounded border-input"
                      />
                      PO not required for this call
                    </label>
                  </div>

                  {call.poRequests.length > 0 && (
                    <p className="text-xs text-muted-foreground">
                      {call.poRequests.length} PO request{call.poRequests.length === 1 ? '' : 's'} logged
                      {call.poRequests.some((r) => r.email_sent_at && !r.authorised_at) && ' · awaiting client response'}
                    </p>
                  )}
                </GatePoint>
              </>
            )}
          </div>
        )}

        {/* Footer: gated close actions */}
        {poView === 'idle' && (
          <div className="sticky bottom-0 flex flex-col gap-2 border-t bg-background px-6 py-4">
            {chargeable ? (
              <>
                {!canSubmitInvoicing && (
                  <p className="text-xs text-amber-600">
                    {!deadlineReasonSatisfied
                      ? 'Enter a reason for missing the deadline to continue.'
                      : !poSatisfied
                        ? 'Enter a PO number or mark it not required to continue.'
                        : ''}
                  </p>
                )}
                <Button
                  className="gap-2 bg-emerald-600 hover:bg-emerald-700"
                  onClick={submitInvoicing}
                  disabled={busyAny || !canSubmitInvoicing}
                >
                  {busy === 'invoice' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Receipt className="h-4 w-4" />}
                  Submit for invoicing &amp; close
                </Button>
              </>
            ) : (
              <>
                {!canMarkReviewed && (
                  <p className="text-xs text-amber-600">
                    Enter a reason for missing the deadline to continue.
                  </p>
                )}
                {call.followUpLogged && (
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <ChevronRight className="h-3 w-3" />
                    A follow-up is logged — closing here only completes the charge review.
                  </p>
                )}
                <Button
                  className="gap-2"
                  onClick={closeReviewed}
                  disabled={busyAny || !canMarkReviewed}
                >
                  {busy === 'reviewed' ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  Mark reviewed &amp; close
                </Button>
              </>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
