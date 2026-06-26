'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Send } from 'lucide-react'
import { toast } from 'sonner'
import { sendQuote } from '@/app/(dashboard)/dashboard/sales/actions'
import type { Quote } from '@/lib/types/database'

function defaultMessage(quote: Quote): string {
  const name = quote.client?.contact_name || quote.prospect_contact || 'there'
  const ref = quote.reference ?? quote.quote_number ?? ''
  return `Hi ${name},

Please find attached our quotation${ref ? ` (${ref})` : ''}${quote.title ? ` for ${quote.title}` : ''}.

You can view the quote online using the button below, or open the attached PDF. If you have any questions or would like to proceed, just reply to this email.

Kind regards,
Pyrocel`
}

export function SendQuoteDialog({
  quote,
  trigger,
  label = 'Send Quote',
}: {
  quote: Quote
  trigger?: React.ReactNode
  label?: string
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  const defaultTo = quote.client?.contact_email || quote.prospect_email || ''
  const ref = quote.reference ?? quote.quote_number ?? ''
  const [to, setTo] = useState(defaultTo)
  const [cc, setCc] = useState('')
  const [subject, setSubject] = useState(
    `Quotation${ref ? ` ${ref}` : ''}${quote.title ? ` — ${quote.title}` : ''}`,
  )
  const [message, setMessage] = useState(defaultMessage(quote))
  const [requireSignature, setRequireSignature] = useState(quote.require_signature ?? false)

  function reset() {
    setTo(defaultTo)
    setCc('')
    setSubject(`Quotation${ref ? ` ${ref}` : ''}${quote.title ? ` — ${quote.title}` : ''}`)
    setMessage(defaultMessage(quote))
    setRequireSignature(quote.require_signature ?? false)
  }

  function handleSend() {
    startTransition(async () => {
      const ccList = cc
        .split(/[,;]/)
        .map((e) => e.trim())
        .filter(Boolean)
      const res = await sendQuote({
        id: quote.id,
        to,
        cc: ccList.length > 0 ? ccList : undefined,
        subject,
        message,
        requireSignature,
      })
      if (res.ok) {
        toast.success('Quote sent to the client')
        setOpen(false)
        router.refresh()
      } else {
        toast.error(res.error ?? 'Could not send the quote')
      }
    })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (next) reset()
      }}
    >
      {trigger ? (
        <span onClick={() => setOpen(true)}>{trigger}</span>
      ) : (
        <Button size="sm" onClick={() => setOpen(true)}>
          <Send className="mr-2 h-4 w-4" />
          {label}
        </Button>
      )}
      <DialogContent className="flex max-h-[90vh] flex-col sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Send quote to client</DialogTitle>
          <DialogDescription>
            Review the draft below. A PDF of the quote is attached automatically and the client gets
            a link to view it online.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 overflow-y-auto">
          <div className="grid gap-2">
            <Label htmlFor="quote-to">To</Label>
            <Input
              id="quote-to"
              type="email"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="client@example.com"
            />
            {!defaultTo && (
              <p className="text-xs text-muted-foreground">
                No contact email is saved for this client — enter one to send.
              </p>
            )}
          </div>

          <div className="grid gap-2">
            <Label htmlFor="quote-cc">CC (optional)</Label>
            <Input
              id="quote-cc"
              value={cc}
              onChange={(e) => setCc(e.target.value)}
              placeholder="comma-separated emails"
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="quote-subject">Subject</Label>
            <Input
              id="quote-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="quote-message">Message</Label>
            <Textarea
              id="quote-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={9}
              className="resize-y"
            />
          </div>

          <div className="flex items-start justify-between gap-4 rounded-md border p-3">
            <div className="grid gap-0.5">
              <Label htmlFor="quote-require-sig">Require signature to approve</Label>
              <p className="text-xs text-muted-foreground">
                The client must draw a signature and enter their name before they can approve.
              </p>
            </div>
            <Switch
              id="quote-require-sig"
              checked={requireSignature}
              onCheckedChange={setRequireSignature}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button onClick={handleSend} disabled={isPending || !to.trim()}>
            <Send className="mr-2 h-4 w-4" />
            {isPending ? 'Sending…' : 'Send quote'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
