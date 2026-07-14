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
import { Check } from 'lucide-react'
import { toast } from 'sonner'
import { SignaturePad } from '@/components/portal/signature-pad'
import { markQuoteAcceptedManually } from '@/app/(dashboard)/dashboard/sales/actions'
import type { Quote } from '@/lib/types/database'

// Accept a quote without emailing it — for quotes printed and signed on paper
// (or agreed verbally). Staff can optionally import the signer's name and a
// drawn/scanned signature so the document reads as an executed contract.
export function MarkAcceptedDialog({
  quote,
  trigger,
}: {
  quote: Quote
  trigger?: React.ReactNode
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  const [captureSignature, setCaptureSignature] = useState(false)
  const [signatureName, setSignatureName] = useState(
    quote.client?.contact_name || quote.prospect_contact || '',
  )
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null)
  const [poNumber, setPoNumber] = useState('')
  const [note, setNote] = useState('')

  function reset() {
    setCaptureSignature(false)
    setSignatureName(quote.client?.contact_name || quote.prospect_contact || '')
    setSignatureDataUrl(null)
    setPoNumber('')
    setNote('')
  }

  const signatureIncomplete =
    captureSignature && (!signatureName.trim() || !signatureDataUrl)

  function handleAccept() {
    startTransition(async () => {
      try {
        const res = await markQuoteAcceptedManually({
          id: quote.id,
          signatureName: captureSignature ? signatureName : undefined,
          signatureDataUrl: captureSignature ? signatureDataUrl ?? undefined : undefined,
          poNumber: poNumber.trim() || undefined,
          note: note.trim() || undefined,
        })
        if (res.ok) {
          toast.success('Quote marked as accepted')
          setOpen(false)
          router.refresh()
        } else {
          toast.error(res.error ?? 'Could not accept the quote')
        }
      } catch (err) {
        console.error('[v0] handleAccept failed:', err)
        toast.error('Could not accept the quote. Please try again.')
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
        <Button
          size="sm"
          variant="outline"
          onClick={() => setOpen(true)}
          className="border-green-600 text-green-700 hover:bg-green-50 hover:text-green-800"
        >
          <Check className="mr-2 h-4 w-4" />
          Mark accepted
        </Button>
      )}
      <DialogContent className="flex max-h-[90vh] flex-col overflow-hidden sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Mark quote as accepted</DialogTitle>
          <DialogDescription>
            Accept this quote without emailing it — for quotes printed and signed on paper, or
            agreed verbally. Optionally import the signer&apos;s name and signature so the document
            reads as a signed contract.
          </DialogDescription>
        </DialogHeader>

        <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto">
          <div className="grid gap-2">
            <Label htmlFor="accept-po">PO number (optional)</Label>
            <Input
              id="accept-po"
              value={poNumber}
              onChange={(e) => setPoNumber(e.target.value)}
              placeholder="Client purchase order reference"
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="accept-note">Note (optional)</Label>
            <Textarea
              id="accept-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              className="resize-y"
              placeholder="e.g. Signed hard copy received 14/07, filed under contracts."
            />
          </div>

          <div className="flex items-start justify-between gap-4 rounded-md border p-3">
            <div className="grid gap-0.5">
              <Label htmlFor="accept-capture-sig">Import client signature</Label>
              <p className="text-xs text-muted-foreground">
                Capture the signer&apos;s name and signature from the signed copy.
              </p>
            </div>
            <Switch
              id="accept-capture-sig"
              checked={captureSignature}
              onCheckedChange={setCaptureSignature}
            />
          </div>

          {captureSignature && (
            <div className="grid gap-4 rounded-md border border-dashed p-3">
              <div className="grid gap-2">
                <Label htmlFor="accept-sig-name">Signed by (full name)</Label>
                <Input
                  id="accept-sig-name"
                  value={signatureName}
                  onChange={(e) => setSignatureName(e.target.value)}
                  placeholder="Name of the person who signed"
                />
              </div>
              <div className="grid gap-2">
                <Label>Signature</Label>
                <SignaturePad onChange={setSignatureDataUrl} />
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button
            onClick={handleAccept}
            disabled={isPending || signatureIncomplete}
            className="bg-green-600 text-white hover:bg-green-700"
          >
            <Check className="mr-2 h-4 w-4" />
            {isPending ? 'Accepting…' : 'Mark accepted'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
