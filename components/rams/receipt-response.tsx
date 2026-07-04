'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { CheckCircle2, Loader2 } from 'lucide-react'
import { SignaturePad } from '@/components/rams/signature-pad'
import { acknowledgeReceipt } from '@/lib/rams/approval-actions'

interface ReceiptResponseProps {
  token: string
  alreadyAcknowledged: boolean
  recipientName?: string | null
}

export function ReceiptResponse({
  token,
  alreadyAcknowledged,
  recipientName,
}: ReceiptResponseProps) {
  const [name, setName] = useState(recipientName ?? '')
  const [signature, setSignature] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(alreadyAcknowledged)

  async function submit() {
    setError(null)
    if (!name.trim()) {
      setError('Please enter your name')
      return
    }
    if (!signature) {
      setError('Please add your signature')
      return
    }
    setBusy(true)
    const res = await acknowledgeReceipt(token, {
      signedName: name.trim(),
      signatureData: signature,
    })
    setBusy(false)
    if (!res.success) {
      setError(res.error ?? 'Something went wrong')
      return
    }
    setDone(true)
  }

  if (done) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-lg border bg-card p-6 text-center">
        <CheckCircle2 className="h-10 w-10 text-emerald-600" />
        <p className="text-lg font-medium">Receipt acknowledged</p>
        <p className="text-sm text-muted-foreground">
          Thank you. Your acknowledgement of receipt has been recorded.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4 rounded-lg border bg-card p-6">
      <div>
        <h2 className="text-sm font-semibold">Acknowledge receipt</h2>
        <p className="text-sm text-muted-foreground">
          Please confirm you have received this RAMS by signing below.
        </p>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="ack-name">Full name</Label>
        <Input
          id="ack-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your name"
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label>Signature</Label>
        <SignaturePad onChange={setSignature} />
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <Button onClick={submit} disabled={busy}>
        {busy ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <CheckCircle2 className="mr-2 h-4 w-4" />
        )}
        Acknowledge receipt
      </Button>
    </div>
  )
}
