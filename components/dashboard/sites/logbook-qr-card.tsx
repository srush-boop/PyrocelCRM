'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import QRCode from 'qrcode'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { setLogbookPassword } from '@/app/logbook/[siteId]/actions'
import { Lock, LockOpen, Printer } from 'lucide-react'

interface LogbookQrCardProps {
  siteId: string
  siteName: string
  siteAddress: string
  passwordProtected: boolean
}

/**
 * A printable poster with the QR code linking to the public log book, plus
 * staff controls to password-protect (or unprotect) the log book. Designed to
 * be stuck on a panel or mounted adjacent to equipment on site.
 */
export function LogbookQrCard({ siteId, siteName, siteAddress, passwordProtected }: LogbookQrCardProps) {
  const [qrDataUrl, setQrDataUrl] = useState<string>('')

  useEffect(() => {
    const url =
      typeof window !== 'undefined'
        ? `${window.location.origin}/logbook/${siteId}`
        : `/logbook/${siteId}`
    QRCode.toDataURL(url, { margin: 1, width: 400, errorCorrectionLevel: 'M' })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(''))
  }, [siteId])

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 print:hidden">
        <p className="text-sm text-muted-foreground">
          Scan to open the on-site fire safety log book.
        </p>
        <div className="flex items-center gap-2">
          <StaffPasswordDialog siteId={siteId} passwordProtected={passwordProtected} />
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer className="mr-2 h-4 w-4" />
            Print poster
          </Button>
        </div>
      </div>

      <p className="mb-3 rounded-md border border-border bg-muted/40 p-3 text-sm text-muted-foreground print:hidden">
        {passwordProtected
          ? 'This log book is password protected for clients. Pyrocel staff can always view it when signed in.'
          : 'This log book is open — anyone with the link or QR code can view it. Protect it with a password if the client prefers.'}
      </p>

      {/* Printable poster */}
      <div className="logbook-poster mx-auto flex max-w-sm flex-col items-center gap-4 rounded-lg border border-border bg-card p-6 text-center">
        <h2 className="text-3xl font-extrabold uppercase leading-none tracking-tight text-balance">
          Fire Safety Log Book
        </h2>
        <div className="space-y-0.5">
          <h3 className="text-base font-bold leading-tight text-balance">{siteName}</h3>
          <p className="text-xs text-muted-foreground">{siteAddress}</p>
        </div>
        {qrDataUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={qrDataUrl || '/placeholder.svg'}
            alt={`QR code for the ${siteName} fire safety log book`}
            className="h-48 w-48"
          />
        ) : (
          <div className="h-48 w-48 animate-pulse rounded bg-muted" />
        )}
        <div className="space-y-1">
          <p className="text-sm font-medium">Scan with your phone camera</p>
          <p className="text-xs text-muted-foreground text-balance">
            Holds this building&apos;s fire safety records &mdash; service reports, routine alarm and
            emergency lighting checks, fire drills and faults.
          </p>
        </div>
      </div>

      <style jsx global>{`
        @media print {
          body * {
            visibility: hidden;
          }
          .logbook-poster,
          .logbook-poster * {
            visibility: visible;
          }
          .logbook-poster {
            position: absolute;
            left: 50%;
            top: 40px;
            transform: translateX(-50%);
          }
        }
      `}</style>
    </div>
  )
}

function StaffPasswordDialog({
  siteId,
  passwordProtected,
}: {
  siteId: string
  passwordProtected: boolean
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function save(next: string | null) {
    setError(null)
    if (next !== null && next.trim().length < 4) {
      setError('Password must be at least 4 characters.')
      return
    }
    startTransition(async () => {
      const result = await setLogbookPassword(siteId, next)
      if (!result.ok) {
        setError(result.error ?? 'Could not update the password.')
        return
      }
      setPassword('')
      setOpen(false)
      router.refresh()
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          {passwordProtected ? (
            <>
              <Lock className="mr-2 h-4 w-4" />
              Password
            </>
          ) : (
            <>
              <LockOpen className="mr-2 h-4 w-4" />
              Protect
            </>
          )}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{passwordProtected ? 'Change log book password' : 'Protect log book'}</DialogTitle>
          <DialogDescription>
            {passwordProtected
              ? 'Set a new client password, or remove protection so anyone with the link can view it. Staff always have access.'
              : 'Set a password clients must enter to view this log book. Pyrocel staff can always view it when signed in.'}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="staff-lb-password">{passwordProtected ? 'New password' : 'Password'}</Label>
          <Input
            id="staff-lb-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 4 characters"
            autoComplete="new-password"
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter className="gap-2 sm:justify-between">
          {passwordProtected && (
            <Button
              type="button"
              variant="ghost"
              className="text-destructive hover:text-destructive"
              disabled={pending}
              onClick={() => save(null)}
            >
              Remove password
            </Button>
          )}
          <Button type="button" disabled={pending} onClick={() => save(password)}>
            {pending ? 'Saving…' : passwordProtected ? 'Update password' : 'Protect log book'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
