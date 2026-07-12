'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  FileText,
  Plus,
  Send,
  CheckCircle2,
  Clock,
  Loader2,
  AlertCircle,
  Mail,
  X,
} from 'lucide-react'
import { formatDateUK } from '@/lib/utils'
import {
  addPoRequest,
  sendPoRequestEmail,
  getPoRequestPreview,
} from '@/lib/actions/po-requests'
import type { PurchaseOrderRequest } from '@/lib/types/database'

interface PoRequestLogProps {
  taskId: string
  requests: PurchaseOrderRequest[]
  /** Whether the site/client has a contact email configured */
  hasContactEmail: boolean
  /** Number of days before a PO request is considered overdue */
  overdueAfterDays: number
}

function daysAgo(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
}

export function PoRequestLog({
  taskId,
  requests,
  hasContactEmail,
  overdueAfterDays,
}: PoRequestLogProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  // Add new request
  const [addOpen, setAddOpen] = useState(false)
  const [newNote, setNewNote] = useState('')
  const [adding, setAdding] = useState(false)

  // Send email dialog
  const [sendOpen, setSendOpen] = useState(false)
  const [sendingId, setSendingId] = useState<string | null>(null)
  const [specialNote, setSpecialNote] = useState('')
  const [sending, setSending] = useState(false)
  const [sentId, setSentId] = useState<string | null>(null)
  // Editable recipient list — seeded from the site/client contacts on file, but
  // amendable (e.g. when the usual contact is away and the client gives an
  // alternate address).
  const [recipients, setRecipients] = useState<string[]>([])
  const [newRecipient, setNewRecipient] = useState('')
  const [loadingRecipients, setLoadingRecipients] = useState(false)

  const handleAdd = async () => {
    setAdding(true)
    const { error, id } = await addPoRequest(taskId, newNote.trim() || null)
    setAdding(false)
    if (error) {
      toast.error(error)
    } else {
      toast.success('PO request entry added')
      setAddOpen(false)
      setNewNote('')
      router.refresh()
    }
  }

  const openSendDialog = (id: string) => {
    setSendingId(id)
    setSpecialNote('')
    setSentId(null)
    setNewRecipient('')
    setRecipients([])
    setSendOpen(true)
    // Seed the editable recipient list from the site/client contacts on file.
    setLoadingRecipients(true)
    getPoRequestPreview(taskId)
      .then(({ data }) => {
        if (data) setRecipients(data.recipients)
      })
      .finally(() => setLoadingRecipients(false))
  }

  const isValidEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())

  const addRecipient = () => {
    const value = newRecipient.trim()
    if (!isValidEmail(value)) {
      toast.error('Enter a valid email address')
      return
    }
    if (recipients.some((r) => r.toLowerCase() === value.toLowerCase())) {
      toast.error('That address is already in the list')
      return
    }
    setRecipients((prev) => [...prev, value])
    setNewRecipient('')
  }

  const removeRecipient = (email: string) => {
    setRecipients((prev) => prev.filter((r) => r !== email))
  }

  const handleSendEmail = async () => {
    if (!sendingId) return
    setSending(true)
    const { error } = await sendPoRequestEmail(
      sendingId,
      taskId,
      specialNote.trim() || null,
      recipients,
    )
    setSending(false)
    if (error) {
      toast.error(error)
    } else {
      setSentId(sendingId)
      toast.success('PO request email sent')
      router.refresh()
    }
  }

  // Most recent un-authorised request — used to determine overdue state
  const pendingRequests = requests.filter((r) => !r.authorised_at && r.email_sent_at)
  const oldestPending = pendingRequests.length > 0
    ? pendingRequests.reduce((a, b) =>
        new Date(a.email_sent_at!).getTime() < new Date(b.email_sent_at!).getTime() ? a : b,
      )
    : null
  const isOverdue = oldestPending
    ? daysAgo(oldestPending.email_sent_at!) >= overdueAfterDays
    : false

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <FileText className="h-4 w-4" />
                PO Request Log
                {isOverdue && (
                  <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100 gap-1 ml-1">
                    <AlertCircle className="h-3 w-3" />
                    Overdue ({overdueAfterDays}+ days)
                  </Badge>
                )}
              </CardTitle>
              <CardDescription className="mt-1">
                {requests.length === 0
                  ? 'No PO requests logged yet.'
                  : `${requests.length} request${requests.length === 1 ? '' : 's'} logged`}
              </CardDescription>
            </div>
            <Button size="sm" variant="outline" className="gap-2" onClick={() => setAddOpen(true)}>
              <Plus className="h-4 w-4" />
              Log request
            </Button>
          </div>
        </CardHeader>

        {requests.length > 0 && (
          <CardContent className="pt-0 space-y-3">
            {requests.map((req) => {
              const authorised = !!req.authorised_at
              const emailSent = !!req.email_sent_at
              const reqDaysAgo = emailSent ? daysAgo(req.email_sent_at!) : null
              const reqOverdue =
                emailSent && !authorised && reqDaysAgo !== null && reqDaysAgo >= overdueAfterDays

              return (
                <div
                  key={req.id}
                  className={`rounded-md border p-3 space-y-1.5 ${
                    authorised
                      ? 'border-emerald-200 bg-emerald-50'
                      : reqOverdue
                        ? 'border-amber-300 bg-amber-50'
                        : 'border-border bg-muted/30'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-sm">
                      {authorised ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                      ) : emailSent ? (
                        <Mail className="h-4 w-4 text-blue-500 shrink-0" />
                      ) : (
                        <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
                      )}
                      <span className="font-medium">
                        {authorised
                          ? 'Authorised'
                          : emailSent
                            ? reqOverdue
                              ? 'Email sent — awaiting PO (overdue)'
                              : 'Email sent — awaiting PO'
                            : 'Logged — not yet sent'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {!emailSent && (
                        <Button
                          size="sm"
                          variant="default"
                          className="gap-2 bg-blue-600 hover:bg-blue-700"
                          onClick={() => openSendDialog(req.id)}
                        >
                          <Send className="h-3.5 w-3.5" />
                          Send PO request
                        </Button>
                      )}
                      {emailSent && !authorised && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-2"
                          onClick={() => openSendDialog(req.id)}
                        >
                          <Send className="h-3.5 w-3.5" />
                          Resend
                        </Button>
                      )}
                    </div>
                  </div>

                  <div className="text-xs text-muted-foreground space-y-0.5">
                    <div>
                      Logged {formatDateUK(req.created_at)} by{' '}
                      {req.requester?.full_name || req.requester?.email || 'Staff'}
                    </div>
                    {emailSent && (
                      <div>
                        Email sent {formatDateUK(req.email_sent_at!)}
                        {req.email_sent_to && req.email_sent_to.length > 0 && (
                          <span className="ml-1">→ {req.email_sent_to.join(', ')}</span>
                        )}
                      </div>
                    )}
                    {req.note && (
                      <div className="text-foreground/70 italic">&quot;{req.note}&quot;</div>
                    )}
                    {req.special_note && (
                      <div className="text-foreground/70 italic">Note to client: &quot;{req.special_note}&quot;</div>
                    )}
                    {authorised && (
                      <div className="text-emerald-700">
                        Authorised {formatDateUK(req.authorised_at!)}
                        {req.authorised_by_name && ` by ${req.authorised_by_name}`}
                        {req.po_number && (
                          <span className="ml-2 font-semibold">PO: {req.po_number}</span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </CardContent>
        )}
      </Card>

      {/* Add log entry dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Log PO Request</DialogTitle>
            <DialogDescription>
              Add a record of a new PO request for this chargeable call. You can send the email
              to the client from the log entry.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="po-log-note">Note (optional)</Label>
              <Textarea
                id="po-log-note"
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                placeholder="Any internal note about this request..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)} disabled={adding}>
              Cancel
            </Button>
            <Button onClick={handleAdd} disabled={adding} className="gap-2">
              {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Add entry
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Send email dialog */}
      <Dialog open={sendOpen} onOpenChange={setSendOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send PO Request Email</DialogTitle>
            <DialogDescription>
              Review and amend the recipient list, then send the PO request email with a secure
              link for the client to provide their PO number.
            </DialogDescription>
          </DialogHeader>
          {sentId === sendingId ? (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <CheckCircle2 className="h-12 w-12 text-emerald-600" />
              <p className="font-medium">PO request email sent</p>
              <p className="text-sm text-muted-foreground">
                The client will receive an email with a link to provide their PO number.
              </p>
            </div>
          ) : (
            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label>This email will be sent to</Label>
                <p className="text-xs text-muted-foreground">
                  Remove or add addresses as needed — e.g. if the usual contact is away and the
                  client has given an alternate email.
                </p>
                {loadingRecipients ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading contacts…
                  </div>
                ) : recipients.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {recipients.map((r) => (
                      <Badge key={r} variant="secondary" className="gap-1 pr-1">
                        <Mail className="h-3 w-3" />
                        {r}
                        <button
                          type="button"
                          onClick={() => removeRecipient(r)}
                          disabled={sending}
                          aria-label={`Remove ${r}`}
                          className="ml-0.5 rounded-full p-0.5 hover:bg-muted-foreground/20 disabled:opacity-50"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    No recipients — add at least one email address below.
                  </div>
                )}
                <div className="flex gap-2 pt-1">
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
                    disabled={sending}
                    className="h-9"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={addRecipient}
                    disabled={sending || !newRecipient.trim()}
                    className="gap-1.5"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add
                  </Button>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="special-note">Special note to client (optional)</Label>
                <Textarea
                  id="special-note"
                  value={specialNote}
                  onChange={(e) => setSpecialNote(e.target.value)}
                  placeholder="Any specific message to include in this email..."
                  rows={3}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            {sentId === sendingId ? (
              <Button onClick={() => setSendOpen(false)}>Close</Button>
            ) : (
              <>
                <Button variant="outline" onClick={() => setSendOpen(false)} disabled={sending}>
                  Cancel
                </Button>
                <Button
                  onClick={handleSendEmail}
                  disabled={sending || loadingRecipients || recipients.length === 0}
                  className="gap-2 bg-blue-600 hover:bg-blue-700"
                >
                  {sending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                  {sending ? 'Sending...' : 'Send PO request email'}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
