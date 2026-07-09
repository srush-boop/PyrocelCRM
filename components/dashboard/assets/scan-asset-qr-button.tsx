'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { QrCode, Loader2, AlertCircle } from 'lucide-react'

interface ScanAssetQrButtonProps {
  variant?: 'default' | 'outline' | 'secondary' | 'ghost'
  size?: 'default' | 'sm' | 'lg' | 'icon'
  label?: string
  className?: string
  /**
   * Optional handler invoked with the decoded URN. When provided, the scanner
   * hands back the URN (e.g. to locate the asset in the current list) instead of
   * navigating to the asset page.
   */
  onScan?: (urn: string) => boolean | void
}

/**
 * Opens a camera-based QR scanner. Decodes the URN (or full asset URL) and
 * navigates to the asset detail page. Falls back to manual URN entry.
 */
export function ScanAssetQrButton({
  variant = 'outline',
  size = 'sm',
  label = 'Scan QR',
  className,
  onScan,
}: ScanAssetQrButtonProps) {
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [starting, setStarting] = useState(false)
  const [manualUrn, setManualUrn] = useState('')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const scannerRef = useRef<any>(null)
  const containerId = 'asset-qr-reader'
  const router = useRouter()

  const goToUrn = (raw: string) => {
    const value = raw.trim()
    if (!value) return
    let urn = value
    const match = value.match(/\/dashboard\/assets\/([^/?#]+)/i)
    if (match) urn = decodeURIComponent(match[1])
    if (onScan) {
      onScan(urn)
      setManualUrn('')
      setOpen(false)
      return
    }
    router.push(`/dashboard/assets/${encodeURIComponent(urn)}`)
    setOpen(false)
  }

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setError(null)
    setStarting(true)

    import('html5-qrcode')
      .then(({ Html5Qrcode }) => {
        if (cancelled) return
        const scanner = new Html5Qrcode(containerId)
        scannerRef.current = scanner
        return scanner.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 220, height: 220 } },
          (decodedText: string) => {
            goToUrn(decodedText)
          },
          () => {
            /* ignore per-frame decode errors */
          },
        )
      })
      .then(() => {
        if (!cancelled) setStarting(false)
      })
      .catch((err) => {
        console.log('[v0] Asset QR scanner error:', err?.message ?? err)
        if (!cancelled) {
          setStarting(false)
          setError('Unable to access the camera. You can enter the asset URN manually below.')
        }
      })

    return () => {
      cancelled = true
      const scanner = scannerRef.current
      if (scanner) {
        scanner
          .stop()
          .then(() => scanner.clear())
          .catch(() => {})
        scannerRef.current = null
      }
    }
  }, [open])

  return (
    <>
      <Button variant={variant} size={size} className={className} onClick={() => setOpen(true)}>
        <QrCode className="mr-2 h-4 w-4" />
        {label}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Scan Asset QR</DialogTitle>
            <DialogDescription>
              Point your camera at an asset label to open its record.
            </DialogDescription>
          </DialogHeader>

          <div className="overflow-hidden rounded-lg border bg-muted">
            <div id={containerId} className="aspect-square w-full" />
          </div>

          {starting && (
            <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Starting camera…
            </p>
          )}

          {error && (
            <div className="flex items-start gap-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form
            className="flex items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              goToUrn(manualUrn)
            }}
          >
            <Input
              placeholder="Enter URN e.g. AST-AB12CD"
              value={manualUrn}
              onChange={(e) => setManualUrn(e.target.value)}
              className="font-mono"
            />
            <Button type="submit" disabled={!manualUrn.trim()}>
              Go
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
