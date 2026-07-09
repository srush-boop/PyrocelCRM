'use client'

import { useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Printer, Send, Mail, X, CheckCircle, Coins, Loader2, Wrench } from 'lucide-react'
import { isDamperService } from '@/lib/dampers'
import { isExtinguisherService } from '@/lib/extinguishers'
import { setChargeReview } from '@/lib/actions/charge-review'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'

/** Resolve the correct printable report viewer path for a service type. */
function reportPath(serviceName: string | undefined, taskId: string): string {
  if (isDamperService(serviceName)) return `/dashboard/dampers/report/${taskId}`
  if (isExtinguisherService(serviceName)) return `/dashboard/extinguishers/report/${taskId}`
  return `/dashboard/reports/${taskId}`
}

interface CompletedReportActionsProps {
  taskId: string
  serviceName?: string
  /** ISO timestamp of the last time the report email was sent, if any. */
  emailSentAt?: string | null
  /** Charge-review state for this completed call (feeds the Chargeable Calls queue). */
  chargeable?: boolean
  chargeReviewStatus?: 'none' | 'pending' | 'reviewed'
  chargeReason?: string | null
  /** True for office/admin, who may change the charge/review state. */
  canReview?: boolean
}

const CHARGE_REASON_LABELS: Record<string, string> = {
  service_default: 'Chargeable service type',
  parts_added: 'Parts used on call',
  manual: 'Marked chargeable manually',
}

/**
 * Action bar shown on a completed call's report overview. Lets office/engineers
 * open the printable report (Print / Save PDF) and (re)send it to the client's
 * configured recipients or an alternate address.
 */
export function CompletedReportActions({
  taskId,
  serviceName,
  emailSentAt,
  chargeable,
  chargeReviewStatus = 'none',
  chargeReason,
  canReview = false,
}: CompletedReportActionsProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [recipientMode, setRecipientMode] = useState<'default' | 'alternate'>('default')
  const [alternateEmails, setAlternateEmails] = useState<string[]>([])
  const [newEmail, setNewEmail] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [reviewBusy, setReviewBusy] = useState(false)

  const showChargeSection = chargeable || chargeReviewStatus !== 'none' || canReview

  const runChargeAction = async (
    action:
      | { kind: 'reviewed' }
      | { kind: 'reopen' }
      | { kind: 'set_chargeable'; chargeable: boolean },
  ) => {
    setReviewBusy(true)
    const { error } = await setChargeReview(taskId, action)
    setReviewBusy(false)
    if (error) {
      toast.error(error)
    } else {
      toast.success('Charge status updated')
      router.refresh()
    }
  }

  const addEmail = () => {
    const email = newEmail.trim()
    if (email && !alternateEmails.includes(email)) {
      setAlternateEmails([...alternateEmails, email])
      setNewEmail('')
    }
  }

  const openDialog = () => {
    setRecipientMode('default')
    setAlternateEmails([])
    setNewEmail('')
    setSent(false)
    setOpen(true)
  }

  const handleSend = async () => {
    if (recipientMode === 'alternate' && alternateEmails.length === 0) {
      toast.error('Add at least one alternate email address')
      return
    }
    setSending(true)
    try {
      const res = await fetch('/api/send-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskId,
          resend: true,
          ...(recipientMode === 'alternate' ? { emails: alternateEmails } : {}),
        }),
      })
      if (res.ok) {
        setSent(true)
        toast.success('Report sent')
      } else {
        const data = await res.json().catch(() => ({}))
        toast.error(data?.error || 'Failed to send report')
      }
    } catch {
      toast.error('Failed to send report')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="space-y-3">
      {showChargeSection && (
        <div
          className={cn(
            'rounded-md border p-3',
            chargeable && chargeReviewStatus === 'pending'
              ? 'border-amber-300 bg-amber-50'
              : chargeReviewStatus === 'reviewed'
                ? 'border-green-300 bg-green-50'
                : 'border-border bg-muted/40',
          )}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              {chargeReason === 'parts_added' ? (
                <Wrench className="h-4 w-4 text-amber-600" />
              ) : (
                <Coins className="h-4 w-4 text-amber-600" />
              )}
              <div className="text-sm">
                <span className="font-medium">
                  {chargeable
                    ? chargeReviewStatus === 'reviewed'
                      ? 'Chargeable — reviewed'
                      : 'Chargeable — awaiting review'
                    : 'Not chargeable'}
                </span>
                {chargeable && chargeReason && CHARGE_REASON_LABELS[chargeReason] && (
                  <span className="ml-2 text-xs text-muted-foreground">
                    {CHARGE_REASON_LABELS[chargeReason]}
                  </span>
                )}
              </div>
            </div>
            {canReview && (
              <div className="flex flex-wrap items-center gap-2">
                {reviewBusy && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                {chargeable && chargeReviewStatus === 'pending' && (
                  <Button
                    size="sm"
                    disabled={reviewBusy}
                    onClick={() => runChargeAction({ kind: 'reviewed' })}
                    className="gap-2"
                  >
                    <CheckCircle className="h-4 w-4" />
                    Mark reviewed
                  </Button>
                )}
                {chargeable && chargeReviewStatus === 'reviewed' && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={reviewBusy}
                    onClick={() => runChargeAction({ kind: 'reopen' })}
                  >
                    Re-open review
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={reviewBusy}
                  onClick={() => runChargeAction({ kind: 'set_chargeable', chargeable: !chargeable })}
                >
                  {chargeable ? 'Mark not chargeable' : 'Mark chargeable'}
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
      <Button variant="outline" size="sm" asChild className="gap-2">
        <Link href={reportPath(serviceName, taskId)} target="_blank">
          <Printer className="h-4 w-4" />
          Preview / Print
        </Link>
      </Button>
      <Button size="sm" onClick={openDialog} className="gap-2">
        <Send className="h-4 w-4" />
        Send report
      </Button>
      {emailSentAt && (
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <Mail className="h-3.5 w-3.5" />
          Last sent {new Date(emailSentAt).toLocaleDateString('en-GB')}
        </span>
      )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send report</DialogTitle>
            <DialogDescription>
              Send this completed report to its configured recipients, or to an alternate email address.
            </DialogDescription>
          </DialogHeader>

          {sent ? (
            <div className="flex flex-col items-center justify-center gap-2 py-6 text-center">
              <CheckCircle className="h-10 w-10 text-green-600" />
              <p className="font-medium">Report sent</p>
            </div>
          ) : (
            <div className="space-y-4">
              <RadioGroup
                value={recipientMode}
                onValueChange={(v) => setRecipientMode(v as 'default' | 'alternate')}
              >
                <div className="flex items-start gap-2">
                  <RadioGroupItem value="default" id="mode-default" className="mt-1" />
                  <Label htmlFor="mode-default" className="font-normal">
                    Use the report&apos;s configured recipients
                    <span className="block text-xs text-muted-foreground">
                      Sends to the client/site emails set up for this report.
                    </span>
                  </Label>
                </div>
                <div className="flex items-start gap-2">
                  <RadioGroupItem value="alternate" id="mode-alternate" className="mt-1" />
                  <Label htmlFor="mode-alternate" className="font-normal">
                    Send to an alternate email
                    <span className="block text-xs text-muted-foreground">
                      Overrides the default recipients for this send.
                    </span>
                  </Label>
                </div>
              </RadioGroup>

              {recipientMode === 'alternate' && (
                <div className="space-y-2">
                  <Label htmlFor="alt-email">Alternate recipients</Label>
                  <div className="flex gap-2">
                    <Input
                      id="alt-email"
                      type="email"
                      value={newEmail}
                      onChange={(e) => setNewEmail(e.target.value)}
                      placeholder="name@example.com"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                          e.preventDefault()
                          addEmail()
                        }
                      }}
                    />
                    <Button type="button" variant="outline" onClick={addEmail}>
                      Add
                    </Button>
                  </div>
                  {alternateEmails.length > 0 && (
                    <div className="flex flex-wrap gap-2 pt-1">
                      {alternateEmails.map((email) => (
                        <Badge key={email} variant="secondary" className="gap-1">
                          {email}
                          <button
                            type="button"
                            onClick={() => setAlternateEmails(alternateEmails.filter((e) => e !== email))}
                            aria-label={`Remove ${email}`}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            {sent ? (
              <Button onClick={() => setOpen(false)}>Close</Button>
            ) : (
              <>
                <Button variant="outline" onClick={() => setOpen(false)} disabled={sending}>
                  Cancel
                </Button>
                <Button onClick={handleSend} disabled={sending} className="gap-2">
                  <Mail className="h-4 w-4" />
                  {sending ? 'Sending...' : 'Send report'}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
