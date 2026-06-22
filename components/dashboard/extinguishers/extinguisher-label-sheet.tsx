'use client'

import { useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Printer } from 'lucide-react'
import { ExtinguisherLabel } from './extinguisher-label'
import type { Extinguisher } from '@/lib/types/database'

interface ExtinguisherLabelSheetProps {
  extinguishers: Extinguisher[]
  siteName?: string
}

export function ExtinguisherLabelSheet({ extinguishers, siteName }: ExtinguisherLabelSheetProps) {
  useEffect(() => {
    // Give QR codes a moment to render before opening the print dialog
    const t = setTimeout(() => window.print(), 800)
    return () => clearTimeout(t)
  }, [])

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6 flex items-center justify-between print:hidden">
        <div>
          <h1 className="text-xl font-bold">Extinguisher QR Labels</h1>
          <p className="text-sm text-muted-foreground">
            {extinguishers.length} label{extinguishers.length === 1 ? '' : 's'}
            {siteName ? ` · ${siteName}` : ''}
          </p>
        </div>
        <Button onClick={() => window.print()}>
          <Printer className="mr-2 h-4 w-4" />
          Print
        </Button>
      </div>

      {extinguishers.length === 0 ? (
        <p className="text-muted-foreground print:hidden">No extinguishers to print.</p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 print:grid-cols-2">
          {extinguishers.map((extinguisher) => (
            <ExtinguisherLabel key={extinguisher.id} extinguisher={extinguisher} siteName={siteName} />
          ))}
        </div>
      )}
    </div>
  )
}
