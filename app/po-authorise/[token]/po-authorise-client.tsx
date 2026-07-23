'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { CheckCircle, Loader2, FileText, AlertCircle } from 'lucide-react'
import { authorisePoRequest, type PoAuthorisationStatus } from '@/lib/actions/po-requests'

interface PoAuthoriseClientProps {
  token: string
  companyName: string
  status: PoAuthorisationStatus
}

function formatDateUK(iso: string | null | undefined): string {
  if (!iso) return ''
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(iso))
}

export function PoAuthoriseClient({ token, companyName, status }: PoAuthoriseClientProps) {
  const [poNumber, setPoNumber] = useState('')
  const [authorisedByName, setAuthorisedByName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!poNumber.trim() && !authorisedByName.trim()) {
      setError('Please enter a PO number or your name to authorise.')
      return
    }
    setSubmitting(true)
    setError(null)
    const result = await authorisePoRequest(
      token,
      poNumber.trim() || null,
      authorisedByName.trim() || null,
    )
    setSubmitting(false)
    if (result.error) {
      setError(result.error)
    } else {
      setDone(true)
    }
  }

  return (
    <div className="min-h-screen bg-muted/40 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-background rounded-xl shadow-lg overflow-hidden">
        {/* Header */}
        <div className="bg-foreground px-8 py-6">
          <p className="text-background font-bold text-lg">{companyName}</p>
          <p className="text-muted-foreground/60 text-sm mt-1">Purchase Order Authorisation</p>
        </div>

        <div className="px-8 py-8">
          {(status.state === 'expired' || status.state === 'not_found') && !done ? (
            <div className="flex flex-col items-center gap-4 py-2 text-center">
              <div className="h-14 w-14 rounded-full bg-amber-100 flex items-center justify-center">
                <AlertCircle className="h-8 w-8 text-amber-600" />
              </div>
              <div>
                <h2 className="text-xl font-bold">
                  {status.state === 'expired' ? 'Link expired' : 'Link not found'}
                </h2>
                <p className="text-muted-foreground text-sm mt-1 text-pretty">
                  {status.state === 'expired'
                    ? `This purchase order authorisation link has expired. Please contact ${companyName} and we'll send you a fresh link.`
                    : `This authorisation link isn't valid. Please check the link or contact ${companyName} for assistance.`}
                </p>
              </div>
            </div>
          ) : status.state === 'already_provided' && !done ? (
            <div className="flex flex-col items-center gap-4 py-2 text-center">
              <div className="h-14 w-14 rounded-full bg-emerald-100 flex items-center justify-center">
                <CheckCircle className="h-8 w-8 text-emerald-600" />
              </div>
              <div>
                <h2 className="text-xl font-bold">Already authorised</h2>
                <p className="text-muted-foreground text-sm mt-1 text-pretty">
                  A purchase order has already been provided for this call
                  {status.siteName ? ` at ${status.siteName}` : ''} and it has now been closed. No
                  further action is needed.
                </p>
              </div>

              <div className="w-full rounded-lg border bg-muted/40 p-4 text-left">
                <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
                  {status.referenceNumber && (
                    <>
                      <dt className="text-muted-foreground">Call reference</dt>
                      <dd className="font-medium">{status.referenceNumber}</dd>
                    </>
                  )}
                  <dt className="text-muted-foreground">PO number</dt>
                  <dd className="font-semibold">{status.poNumber || 'Not recorded'}</dd>
                  <dt className="text-muted-foreground">Provided by</dt>
                  <dd className="font-medium">{status.authorisedByName || 'Not recorded'}</dd>
                  {status.authorisedAt && (
                    <>
                      <dt className="text-muted-foreground">Authorised on</dt>
                      <dd className="font-medium">{formatDateUK(status.authorisedAt)}</dd>
                    </>
                  )}
                </dl>
              </div>

              <p className="text-xs text-muted-foreground text-pretty">
                If you believe this is incorrect or need to make a change, please contact{' '}
                {companyName}.
              </p>
            </div>
          ) : done ? (
            <div className="flex flex-col items-center gap-4 py-6 text-center">
              <CheckCircle className="h-14 w-14 text-emerald-600" />
              <h2 className="text-xl font-bold">Thank you!</h2>
              <p className="text-muted-foreground text-sm">
                Your authorisation has been recorded. We will be in touch regarding the invoice.
              </p>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-3 mb-6">
                <div className="h-10 w-10 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
                  <FileText className="h-5 w-5 text-emerald-700" />
                </div>
                <div>
                  <h2 className="font-semibold text-base">Authorise Work</h2>
                  <p className="text-sm text-muted-foreground">
                    Please enter your Purchase Order number or name to confirm authorisation of the
                    completed work.
                  </p>
                </div>
              </div>

              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="space-y-1.5">
                  <Label htmlFor="po-number">PO Number (if available)</Label>
                  <Input
                    id="po-number"
                    value={poNumber}
                    onChange={(e) => setPoNumber(e.target.value)}
                    placeholder="e.g. PO-2026-00123"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="auth-name">Authorised by (name)</Label>
                  <Input
                    id="auth-name"
                    value={authorisedByName}
                    onChange={(e) => setAuthorisedByName(e.target.value)}
                    placeholder="Your full name"
                  />
                </div>

                {error && (
                  <p className="text-sm text-destructive">{error}</p>
                )}

                <Button type="submit" disabled={submitting} className="w-full gap-2">
                  {submitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Submitting...
                    </>
                  ) : (
                    <>
                      <CheckCircle className="h-4 w-4" />
                      Confirm Authorisation
                    </>
                  )}
                </Button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
