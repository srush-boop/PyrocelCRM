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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Send, Sparkles, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { sendContractCopy } from '@/app/(dashboard)/dashboard/sales/actions'
import { draftQuoteEmail } from '@/lib/ai/draft-quote-email'
import type { EmailTone } from '@/lib/ai/shared'
import type { Quote } from '@/lib/types/database'

function defaultMessage(quote: Quote): string {
  const name = quote.client?.contact_name || quote.prospect_contact || 'there'
  const ref = quote.reference ?? quote.quote_number ?? ''
  return `Hi ${name},

Thank you for confirming your maintenance contract${ref ? ` (${ref})` : ''}${quote.title ? ` for ${quote.title}` : ''}.

Please find attached a signed copy of your agreement for your records. We'll be in touch to schedule your first visit. If you have any questions, just reply to this email.

Kind regards,
Pyrocel`
}

// Email a signed copy of the approved maintenance contract to the client. The
// contract must already be committed (approved) in Contract Review. Mirrors the
// SendQuoteDialog UX (AI draft, tone, CC) but attaches the executed contract PDF
// and does not include an online approval link.
export function SendContractDialog({
  reviewId,
  quote,
  trigger,
}: {
  reviewId: string
  quote: Quote
  trigger?: React.ReactNode
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  const defaultTo = quote.client?.contact_email || quote.prospect_email || ''
  const ref = quote.reference ?? quote.quote_number ?? ''
  const defaultSubject = `Your maintenance contract${ref ? ` ${ref}` : ''}${quote.title ? ` — ${quote.title}` : ''}`

  const [to, setTo] = useState(defaultTo)
  const [cc, setCc] = useState('')
  const [subject, setSubject] = useState(defaultSubject)
  const [message, setMessage] = useState(defaultMessage(quote))
  const [tone, setTone] = useState<EmailTone>('professional')
  const [instructions, setInstructions] = useState('')
  const [isDrafting, setIsDrafting] = useState(false)

  async function handleAiDraft() {
    setIsDrafting(true)
    try {
      const res = await draftQuoteEmail({
        quoteId: quote.id,
        tone,
        instructions:
          `This is a signed maintenance contract copy being sent after the client accepted it. ${instructions.trim()}`.trim(),
      })
      if (res.ok && res.body) {
        if (res.subject) setSubject(res.subject)
        setMessage(res.body)
        toast.success('Draft generated — review and edit before sending')
      } else {
        toast.error(res.error ?? 'Could not generate a draft')
      }
    } catch (err) {
      console.error('[v0] handleAiDraft (contract) failed:', err)
      toast.error('Could not generate a draft. Please try again.')
    } finally {
      setIsDrafting(false)
    }
  }

  function reset() {
    setTo(defaultTo)
    setCc('')
    setSubject(defaultSubject)
    setMessage(defaultMessage(quote))
    setTone('professional')
    setInstructions('')
  }

  function handleSend() {
    startTransition(async () => {
      try {
        const ccList = cc
          .split(/[,;]/)
          .map((e) => e.trim())
          .filter(Boolean)
        const res = await sendContractCopy({
          reviewId,
          to,
          cc: ccList.length > 0 ? ccList : undefined,
          subject,
          message,
        })
        if (res.ok) {
          toast.success('Contract copy sent to the client')
          setOpen(false)
          router.refresh()
        } else {
          toast.error(res.error ?? 'Could not send the contract')
        }
      } catch (err) {
        console.error('[v0] handleSend (contract) failed:', err)
        toast.error('Could not send the contract. Please try again.')
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
          Email contract copy
        </Button>
      )}
      <DialogContent className="flex max-h-[90vh] flex-col overflow-hidden sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Email signed contract to client</DialogTitle>
          <DialogDescription>
            A PDF copy of the executed maintenance contract is attached automatically. Review the
            draft below before sending.
          </DialogDescription>
        </DialogHeader>

        <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto">
          <div className="grid gap-2">
            <Label htmlFor="contract-to">To</Label>
            <Input
              id="contract-to"
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
            <Label htmlFor="contract-cc">CC (optional)</Label>
            <Input
              id="contract-cc"
              value={cc}
              onChange={(e) => setCc(e.target.value)}
              placeholder="comma-separated emails"
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="contract-subject">Subject</Label>
            <Input
              id="contract-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
          </div>

          <div className="grid gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label htmlFor="contract-message">Message</Label>
              <div className="flex items-center gap-2">
                <Select value={tone} onValueChange={(v) => setTone(v as EmailTone)}>
                  <SelectTrigger className="h-8 w-[130px]" aria-label="Draft tone">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="professional">Professional</SelectItem>
                    <SelectItem value="friendly">Friendly</SelectItem>
                    <SelectItem value="concise">Concise</SelectItem>
                    <SelectItem value="formal">Formal</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8"
                  onClick={handleAiDraft}
                  disabled={isDrafting}
                >
                  {isDrafting ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Sparkles className="mr-2 h-4 w-4" />
                  )}
                  {isDrafting ? 'Drafting…' : 'AI draft'}
                </Button>
              </div>
            </div>
            <Input
              id="contract-ai-instructions"
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="Optional: steer the AI draft"
              aria-label="Additional instructions for the AI draft"
            />
            <Textarea
              id="contract-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={9}
              className="resize-y"
            />
            <p className="text-xs text-muted-foreground">
              AI drafts use this contract&apos;s details. Always review before sending.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button onClick={handleSend} disabled={isPending || !to.trim()}>
            <Send className="mr-2 h-4 w-4" />
            {isPending ? 'Sending…' : 'Send contract'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
