'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
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
import { Send, Loader2 } from 'lucide-react'
import { sendInvoiceToClient } from '@/lib/actions/invoices'
import type { Invoice } from '@/lib/types/database'

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
}

interface Props {
  invoice: Invoice
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Called after a successful send (e.g. to refresh a parent list). */
  onSent?: () => void
}

// Shared "Send invoice to client" dialog used by the invoices list quick-actions
// and the invoice detail page. Pre-fills the billing account's invoice email but
// lets the office type a different recipient (or supply one when none is on
// file). The address shown on the PDF is resolved server-side.
export function SendInvoiceDialog({ invoice, open, onOpenChange, onSent }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [email, setEmail] = useState(invoice.bill_to_email?.trim() ?? '')

  const trimmed = email.trim()
  const valid = isValidEmail(trimmed)

  const send = () => {
    if (!valid) {
      toast.error('Enter a valid email address to send to.')
      return
    }
    startTransition(async () => {
      const res = await sendInvoiceToClient(invoice.id, trimmed)
      if (res.error) {
        toast.error(res.error)
        return
      }
      toast.success(`Invoice sent to ${trimmed}`)
      onOpenChange(false)
      onSent?.()
      router.refresh()
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Send {invoice.invoice_number} to client</DialogTitle>
          <DialogDescription>
            {invoice.status === 'draft'
              ? 'The invoice is issued first, then the PDF is emailed. Once sent, it can no longer be edited.'
              : 'The invoice PDF is emailed to the address below. Once sent, it can no longer be edited.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="send-invoice-email">Recipient email</Label>
          <Input
            id="send-invoice-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@company.com"
            autoComplete="off"
          />
          {!invoice.bill_to_email?.trim() ? (
            <p className="text-xs text-muted-foreground">
              No invoice email is on file for this billing account — enter one to send.
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              Defaults to the billing account&apos;s invoice email. Edit it to send elsewhere.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={send} disabled={pending || !valid}>
            {pending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Send className="mr-2 h-4 w-4" />
            )}
            Send now
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
