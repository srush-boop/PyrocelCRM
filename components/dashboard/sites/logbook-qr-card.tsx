'use client'

import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { Button } from '@/components/ui/button'
import { Printer } from 'lucide-react'

interface LogbookQrCardProps {
  siteId: string
  siteName: string
  siteAddress: string
  postcode: string | null
}

/**
 * A printable poster with the QR code linking to the public log book.
 * Designed to be stuck on a panel or mounted adjacent to equipment on site.
 */
export function LogbookQrCard({ siteId, siteName, siteAddress, postcode }: LogbookQrCardProps) {
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
      <div className="mb-3 flex items-center justify-between print:hidden">
        <p className="text-sm text-muted-foreground">
          Scan to open the on-site fire safety log book.
        </p>
        <Button variant="outline" size="sm" onClick={() => window.print()}>
          <Printer className="mr-2 h-4 w-4" />
          Print poster
        </Button>
      </div>

      {!postcode && (
        <p className="mb-3 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-foreground print:hidden">
          This site has no postcode set. Add a postcode in the site settings so occupiers can unlock
          the log book.
        </p>
      )}

      {/* Printable poster */}
      <div className="logbook-poster mx-auto flex max-w-sm flex-col items-center gap-3 rounded-lg border border-border bg-card p-6 text-center">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Fire Safety Log Book
        </p>
        <h3 className="text-lg font-bold leading-tight text-balance">{siteName}</h3>
        <p className="text-xs text-muted-foreground">{siteAddress}</p>
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
          <p className="text-xs text-muted-foreground">
            Enter the site postcode to view records and log routine checks.
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
