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
import { Lock, LockOpen, Printer, QrCode } from 'lucide-react'

interface LogbookPublicControlsProps {
  siteId: string
  siteName: string
  siteAddress: string
  passwordProtected: boolean
}

/**
 * Client-facing controls on the public log book landing page:
 *  - print a "Scan for site log book" QR poster, and
 *  - optionally password-protect the log book (or change / remove it).
 */
export function LogbookPublicControls({
  siteId,
  siteName,
  siteAddress,
  passwordProtected,
}: LogbookPublicControlsProps) {
  const router = useRouter()
  const [qrDataUrl, setQrDataUrl] = useState('')

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
    <div className="flex flex-wrap items-center gap-2 print:hidden">
      <Button variant="outline" size="sm" onClick={() => window.print()}>
        <Printer className="mr-2 h-4 w-4" />
        Print QR code
      </Button>

      <PasswordDialog
        siteId={siteId}
        passwordProtected={passwordProtected}
        onDone={() => router.refresh()}
      />

      {/* Printable "Scan for site log book" poster (hidden until printed). */}
      <div className="logbook-qr-print fixed left-0 top-0 hidden">
        <div className="flex w-full flex-col items-center gap-6 p-10 text-center">
          <QrCode className="h-8 w-8" aria-hidden="true" />
          <h2 className="text-4xl font-extrabold uppercase tracking-tight">Scan for site log book</h2>
          <div>
            <p className="text-xl font-bold">{siteName}</p>
            <p className="text-sm text-muted-foreground">{siteAddress}</p>
          </div>
          {qrDataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qrDataUrl || '/placeholder.svg'} alt="Log book QR code" className="h-64 w-64" />
          ) : null}
          <p className="max-w-md text-sm text-muted-foreground text-pretty">
            Scan with your phone camera to open this building&apos;s fire safety log book &mdash;
            service reports, routine alarm and emergency lighting checks, fire drills and faults.
          </p>
        </div>
      </div>

      <style jsx global>{`
        @media print {
          body * {
            visibility: hidden;
          }
          .logbook-qr-print,
          .logbook-qr-print * {
            visibility: visible;
          }
          .logbook-qr-print {
            display: block !important;
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

function PasswordDialog({
  siteId,
  passwordProtected,
  onDone,
}: {
  siteId: string
  passwordProtected: boolean
  onDone: () => void
}) {
  const [open, setOpen] = useState(false)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function save(next: string | null) {
    setError(null)
    if (next !== null) {
      if (next.trim().length < 4) {
        setError('Password must be at least 4 characters.')
        return
      }
      if (next !== confirm) {
        setError('Passwords do not match.')
        return
      }
    }
    startTransition(async () => {
      const result = await setLogbookPassword(siteId, next)
      if (!result.ok) {
        setError(result.error ?? 'Could not update the password.')
        return
      }
      setPassword('')
      setConfirm('')
      setOpen(false)
      onDone()
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          {passwordProtected ? (
            <>
              <Lock className="mr-2 h-4 w-4" />
              Password protected
            </>
          ) : (
            <>
              <LockOpen className="mr-2 h-4 w-4" />
              Protect log book
            </>
          )}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{passwordProtected ? 'Change log book password' : 'Protect this log book'}</DialogTitle>
          <DialogDescription>
            {passwordProtected
              ? 'Set a new password, or remove protection so anyone with the link can view the log book.'
              : 'Set a password so only people you share it with can view this log book. Pyrocel staff can always view it.'}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="lb-new-password">{passwordProtected ? 'New password' : 'Password'}</Label>
            <Input
              id="lb-new-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 4 characters"
              autoComplete="new-password"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="lb-confirm-password">Confirm password</Label>
            <Input
              id="lb-confirm-password"
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
            />
          </div>
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
