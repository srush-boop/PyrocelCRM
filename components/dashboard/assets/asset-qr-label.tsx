'use client'

import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import type { Asset } from '@/lib/types/database'

interface AssetQrLabelProps {
  asset: Pick<Asset, 'urn' | 'name' | 'sage_reference' | 'serial_number'>
  categoryName?: string | null
}

/**
 * A single printable QR label for a company asset. Encodes the absolute URL to
 * the asset detail page so a scan opens the in-app record.
 */
export function AssetQrLabel({ asset, categoryName }: AssetQrLabelProps) {
  const [qrDataUrl, setQrDataUrl] = useState<string>('')

  useEffect(() => {
    const url =
      typeof window !== 'undefined'
        ? `${window.location.origin}/dashboard/assets/${asset.urn}`
        : `/dashboard/assets/${asset.urn}`
    QRCode.toDataURL(url, { margin: 1, width: 240, errorCorrectionLevel: 'M' })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(''))
  }, [asset.urn])

  return (
    <div className="asset-label flex items-center gap-3 rounded-lg border border-border bg-card p-3">
      {qrDataUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={qrDataUrl || '/placeholder.svg'}
          alt={`QR code for asset ${asset.urn}`}
          className="h-24 w-24 shrink-0"
        />
      ) : (
        <div className="h-24 w-24 shrink-0 animate-pulse rounded bg-muted" />
      )}
      <div className="min-w-0">
        <p className="font-mono text-lg font-bold leading-tight">{asset.urn}</p>
        <p className="truncate text-sm font-medium text-foreground">{asset.name}</p>
        {categoryName && (
          <p className="truncate text-xs text-muted-foreground">{categoryName}</p>
        )}
        {asset.sage_reference && (
          <p className="truncate text-xs text-muted-foreground">SAGE: {asset.sage_reference}</p>
        )}
        {asset.serial_number && (
          <p className="truncate text-xs text-muted-foreground">S/N: {asset.serial_number}</p>
        )}
        <p className="mt-1 text-[10px] uppercase tracking-wide text-muted-foreground">
          Scan to view asset record
        </p>
      </div>
    </div>
  )
}
