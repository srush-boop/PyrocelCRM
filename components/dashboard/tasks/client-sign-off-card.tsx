'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { SignaturePad } from '@/components/portal/signature-pad'

interface ClientSignOffCardProps {
  /** Printed name of the on-site representative signing off. */
  name: string
  onNameChange: (value: string) => void
  /** Captured signature as a PNG data URL, or null when not yet drawn. */
  signature: string | null
  onSignatureChange: (value: string | null) => void
  /** When false the card is read-only (e.g. a completed / paused call). */
  canEdit: boolean
}

/**
 * Shared "Client sign-off" card for non-recurring calls. Captures the on-site
 * representative's printed name and signature, stored on the task result and
 * shown on the report. Used by the generic and asset (damper / extinguisher /
 * emergency-light / MCP) inspection flows so behaviour stays consistent.
 */
export function ClientSignOffCard({
  name,
  onNameChange,
  signature,
  onSignatureChange,
  canEdit,
}: ClientSignOffCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Client sign-off</CardTitle>
        <CardDescription>
          Optional — capture the name and signature of the on-site
          representative confirming the work carried out.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-1.5">
          <Label htmlFor="client-signature-name">Client / representative name</Label>
          <Input
            id="client-signature-name"
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
            placeholder="e.g. J. Smith (Facilities Manager)"
            disabled={!canEdit}
          />
        </div>
        <div className="grid gap-1.5">
          <Label>Signature</Label>
          {canEdit ? (
            signature ? (
              <div className="grid gap-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={signature || '/placeholder.svg'}
                  alt="Captured client signature"
                  className="h-40 w-full rounded-md border border-input bg-background object-contain"
                />
                <div className="flex justify-end">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => onSignatureChange(null)}
                  >
                    Redraw signature
                  </Button>
                </div>
              </div>
            ) : (
              <SignaturePad onChange={onSignatureChange} />
            )
          ) : signature ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={signature || '/placeholder.svg'}
              alt="Client signature"
              className="h-40 w-full rounded-md border border-input bg-background object-contain"
            />
          ) : (
            <p className="text-sm text-muted-foreground">No signature captured.</p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
