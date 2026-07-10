'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { CheckCircle, Loader2, FileText } from 'lucide-react'
import { authorisePoRequest } from '@/lib/actions/po-requests'

interface PoAuthoriseClientProps {
  token: string
  companyName: string
}

export function PoAuthoriseClient({ token, companyName }: PoAuthoriseClientProps) {
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
          {done ? (
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
