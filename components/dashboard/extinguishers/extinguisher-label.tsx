'use client'

import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { EXTINGUISHER_TYPE_LABELS } from '@/lib/extinguishers'
import type { Extinguisher } from '@/lib/types/database'

interface ExtinguisherLabelProps {
  extinguisher: Pick<
    Extinguisher,
    'urn' | 'reference' | 'location' | 'floor' | 'extinguisher_type' | 'capacity'
  >
  siteName?: string
}

/**
 * A single printable QR label for an extinguisher. Encodes the absolute URL to
 * the extinguisher asset page so a scan opens the in-app service history view.
 */
export function ExtinguisherLabel({ extinguisher, siteName }: ExtinguisherLabelProps) {
  const [qrDataUrl, setQrDataUrl] = useState<string>('')

  useEffect(() => {
    const url =
      typeof window !== 'undefined'
        ? `${window.location.origin}/dashboard/extinguishers/${extinguisher.urn}`
        : `/dashboard/extinguishers/${extinguisher.urn}`
    QRCode.toDataURL(url, { margin: 1, width: 240, errorCorrectionLevel: 'M' })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(''))
  }, [extinguisher.urn])

  return (
    <div className="extinguisher-label flex items-center gap-3 rounded-lg border border-border bg-card p-3">
      {qrDataUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={qrDataUrl || '/placeholder.svg'}
          alt={`QR code for extinguisher ${extinguisher.urn}`}
          className="h-24 w-24 shrink-0"
        />
      ) : (
        <div className="h-24 w-24 shrink-0 animate-pulse rounded bg-muted" />
      )}
      <div className="min-w-0">
        <p className="font-mono text-lg font-bold leading-tight">{extinguisher.urn}</p>
        <p className="text-sm font-medium text-foreground">
          {EXTINGUISHER_TYPE_LABELS[extinguisher.extinguisher_type] ?? extinguisher.extinguisher_type}
          {extinguisher.capacity ? ` · ${extinguisher.capacity}` : ''}
        </p>
        {extinguisher.location && (
          <p className="truncate text-xs text-muted-foreground">{extinguisher.location}</p>
        )}
        {extinguisher.floor && (
          <p className="truncate text-xs text-muted-foreground">Floor: {extinguisher.floor}</p>
        )}
        {siteName && (
          <p className="truncate text-xs text-muted-foreground">{siteName}</p>
        )}
        <p className="mt-1 text-[10px] uppercase tracking-wide text-muted-foreground">
          Scan to view service history
        </p>
      </div>
    </div>
  )
}
