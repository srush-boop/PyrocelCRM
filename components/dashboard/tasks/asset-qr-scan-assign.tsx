'use client'

import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { QrCode, Loader2, AlertCircle, CheckCircle2, Link2 } from 'lucide-react'
import { cn } from '@/lib/utils'

/** A single asset that a physical QR code can be located against or linked to. */
export interface AssetQrItem {
  id: string
  /** Human label shown in the picker, e.g. "FD-01 · Level 2 · Plant room". */
  label: string
  /** App-generated URN (may be null for MCP/EL). */
  urn?: string | null
  /** Optional secondary reference/map reference. */
  reference?: string | null
  /** Previously-linked physical QR code, if any. */
  qr_code?: string | null
}

interface AssetQrScanAssignProps {
  assets: AssetQrItem[]
  /** Singular noun, e.g. "damper", "extinguisher", "call point", "emergency light". */
  assetNoun: string
  /** URL segment used to strip a scanned app URL down to its URN, e.g. "dampers". */
  urlPath: string
  /** Whether the engineer may link codes (only while the call is editable). */
  canAssign: boolean
  /** Locate a matched asset in the current list (scroll/highlight). */
  onLocate?: (id: string) => void
  /** Persist a physical code against an asset. Should throw on failure. */
  onAssign: (id: string, code: string) => Promise<void>
  variant?: 'default' | 'outline' | 'secondary' | 'ghost'
  size?: 'default' | 'sm' | 'lg' | 'icon'
  label?: string
  className?: string
}

// Reduce a scanned value to a comparable code: strip an app asset URL down to
// its URN segment, otherwise use the raw trimmed text.
function normaliseScan(raw: string, urlPath: string): string {
  const value = raw.trim()
  const match = value.match(new RegExp(`/dashboard/${urlPath}/([^/?#]+)`, 'i'))
  return match ? decodeURIComponent(match[1]) : value
}

/**
 * Field tool for the four system-asset inspections. Scans a QR code and either
 * LOCATES the matching asset (by linked qr_code, urn, or reference) or, when the
 * code is unrecognised, lets the engineer LINK that physical sticker to an asset
 * on the register — stored as an alias alongside the app-generated URN.
 */
export function AssetQrScanAssign({
  assets,
  assetNoun,
  urlPath,
  canAssign,
  onLocate,
  onAssign,
  variant = 'outline',
  size = 'sm',
  label = 'Scan QR',
  className,
}: AssetQrScanAssignProps) {
  const [open, setOpen] = useState(false)
  const [view, setView] = useState<'scan' | 'assign'>('scan')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [starting, setStarting] = useState(false)
  const [manual, setManual] = useState('')
  // The code awaiting assignment once the engineer picks an asset.
  const [pendingCode, setPendingCode] = useState('')
  const [assigning, setAssigning] = useState(false)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const scannerRef = useRef<any>(null)
  const containerId = `qr-reader-${useId().replace(/:/g, '')}`

  const findMatch = (code: string): AssetQrItem | undefined => {
    const c = code.toLowerCase()
    return assets.find(
      (a) =>
        (a.qr_code || '').toLowerCase() === c ||
        (a.urn || '').toLowerCase() === c ||
        (a.reference || '').toLowerCase() === c,
    )
  }

  const handleCode = (raw: string) => {
    const code = normaliseScan(raw, urlPath)
    if (!code) return
    setManual('')
    const match = findMatch(code)
    if (match) {
      setNotice(null)
      onLocate?.(match.id)
      setOpen(false)
      return
    }
    if (!canAssign) {
      setError(`No ${assetNoun} matching "${code}" on this site's register.`)
      return
    }
    // Unrecognised → move to the link step, carrying the scanned code.
    setPendingCode(code)
    setError(null)
    setView('assign')
  }

  const handleAssign = async (asset: AssetQrItem) => {
    if (!pendingCode) return
    setAssigning(true)
    try {
      await onAssign(asset.id, pendingCode)
      setNotice(`Linked QR code to ${asset.label}.`)
      setView('scan')
      setPendingCode('')
      setOpen(false)
    } catch (err) {
      console.log('[v0] Assign QR error:', err instanceof Error ? err.message : err)
      setError('Could not link that code — it may already be linked to another asset.')
    } finally {
      setAssigning(false)
    }
  }

  // Reset transient state whenever the dialog closes.
  useEffect(() => {
    if (!open) {
      setView('scan')
      setError(null)
      setNotice(null)
      setManual('')
      setPendingCode('')
    }
  }, [open])

  // Camera lifecycle — only while the scan view is showing.
  useEffect(() => {
    if (!open || view !== 'scan') return
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
          (decodedText: string) => handleCode(decodedText),
          () => {
            /* ignore per-frame decode errors */
          },
        )
      })
      .then(() => {
        if (!cancelled) setStarting(false)
      })
      .catch((err) => {
        console.log('[v0] QR scanner error:', err?.message ?? err)
        if (!cancelled) {
          setStarting(false)
          setError('Unable to access the camera. Enter the code manually below.')
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, view])

  const sortedAssets = useMemo(
    () => [...assets].sort((a, b) => a.label.localeCompare(b.label)),
    [assets],
  )

  return (
    <>
      <Button
        variant={variant}
        size={size}
        className={className}
        onClick={() => setOpen(true)}
        aria-label={label}
        title={label}
      >
        <QrCode className={cn('h-4 w-4', size !== 'icon' && 'mr-2')} />
        {size !== 'icon' && label}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          {view === 'scan' ? (
            <>
              <DialogHeader>
                <DialogTitle>Scan QR code</DialogTitle>
                <DialogDescription>
                  {canAssign
                    ? `Scan a ${assetNoun}'s label to jump to it. If the code isn't recognised, you can link it to a ${assetNoun}.`
                    : `Scan a ${assetNoun}'s label to jump to it.`}
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
                  handleCode(manual)
                }}
              >
                <Input
                  placeholder="Enter code manually"
                  value={manual}
                  onChange={(e) => setManual(e.target.value)}
                  className="font-mono"
                />
                <Button type="submit" disabled={!manual.trim()}>
                  Go
                </Button>
              </form>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>Link QR code</DialogTitle>
                <DialogDescription>
                  Choose which {assetNoun} to link{' '}
                  <span className="font-mono font-medium text-foreground">{pendingCode}</span> to.
                  Scanning it in future will jump straight here.
                </DialogDescription>
              </DialogHeader>

              {error && (
                <div className="flex items-start gap-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <Command className="rounded-lg border">
                <CommandInput placeholder={`Search ${assetNoun}s…`} />
                <CommandList>
                  <CommandEmpty>No {assetNoun}s found.</CommandEmpty>
                  <CommandGroup>
                    {sortedAssets.map((a) => (
                      <CommandItem
                        key={a.id}
                        value={`${a.label} ${a.urn ?? ''} ${a.reference ?? ''}`}
                        onSelect={() => !assigning && handleAssign(a)}
                        className="flex items-center justify-between gap-2"
                      >
                        <span className="truncate">
                          {a.label}
                          {a.qr_code && (
                            <span className="ml-1 text-xs text-muted-foreground">
                              (linked: {a.qr_code})
                            </span>
                          )}
                        </span>
                        {assigning ? (
                          <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                        ) : (
                          <Link2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                        )}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>

              <div className="flex justify-between">
                <Button variant="ghost" size="sm" onClick={() => setView('scan')} disabled={assigning}>
                  Back to scan
                </Button>
              </div>
            </>
          )}

          {notice && (
            <div className="flex items-start gap-2 rounded-md bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-400">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{notice}</span>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
