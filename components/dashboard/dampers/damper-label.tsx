'use client'

import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { DAMPER_TYPE_LABELS } from '@/lib/dampers'
import type { Damper } from '@/lib/types/database'

interface DamperLabelProps {
  damper: Pick<Damper, 'urn' | 'reference' | 'location' | 'floor' | 'damper_type'>
  siteName?: string
}

/**
 * A single printable QR label for a damper. Encodes the absolute URL to the
 * damper asset page so a scan opens the in-app history view.
 */
export function DamperLabel({ damper, siteName }: DamperLabelProps) {
  const [qrDataUrl, setQrDataUrl] = useState<string>('')

  useEffect(() => {
    const url =
      typeof window !== 'undefined'
        ? `${window.location.origin}/dashboard/dampers/${damper.urn}`
        : `/dashboard/dampers/${damper.urn}`
    QRCode.toDataURL(url, { margin: 1, width: 240, errorCorrectionLevel: 'M' })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(''))
  }, [damper.urn])

  return (
    <div className="damper-label flex items-center gap-3 rounded-lg border border-border bg-card p-3">
      {qrDataUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={qrDataUrl || '/placeholder.svg'}
          alt={`QR code for damper ${damper.urn}`}
          className="h-24 w-24 shrink-0"
        />
      ) : (
        <div className="h-24 w-24 shrink-0 animate-pulse rounded bg-muted" />
      )}
      <div className="min-w-0">
        <p className="font-mono text-lg font-bold leading-tight">{damper.urn}</p>
        <p className="text-sm font-medium text-foreground">
          {DAMPER_TYPE_LABELS[damper.damper_type] ?? damper.damper_type}
        </p>
        {damper.location && (
          <p className="truncate text-xs text-muted-foreground">{damper.location}</p>
        )}
        {damper.floor && (
          <p className="truncate text-xs text-muted-foreground">Floor: {damper.floor}</p>
        )}
        {siteName && (
          <p className="truncate text-xs text-muted-foreground">{siteName}</p>
        )}
        <p className="mt-1 text-[10px] uppercase tracking-wide text-muted-foreground">
          Scan to view inspection history
        </p>
      </div>
    </div>
  )
}
