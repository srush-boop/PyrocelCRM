'use client'

import { useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Printer } from 'lucide-react'
import { AssetQrLabel } from './asset-qr-label'
import type { Asset } from '@/lib/types/database'

interface AssetLabelSheetProps {
  assets: Asset[]
}

export function AssetLabelSheet({ assets }: AssetLabelSheetProps) {
  useEffect(() => {
    // Give QR codes a moment to render before opening the print dialog.
    const t = setTimeout(() => window.print(), 800)
    return () => clearTimeout(t)
  }, [])

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6 flex items-center justify-between print:hidden">
        <div>
          <h1 className="text-xl font-bold">Asset QR Labels</h1>
          <p className="text-sm text-muted-foreground">
            {assets.length} label{assets.length === 1 ? '' : 's'}
          </p>
        </div>
        <Button onClick={() => window.print()}>
          <Printer className="mr-2 h-4 w-4" />
          Print
        </Button>
      </div>

      {assets.length === 0 ? (
        <p className="text-muted-foreground print:hidden">No assets to print.</p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 print:grid-cols-2">
          {assets.map((asset) => (
            <AssetQrLabel key={asset.id} asset={asset} categoryName={asset.category?.name} />
          ))}
        </div>
      )}
    </div>
  )
}
