'use client'

import { useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Printer } from 'lucide-react'
import { DamperLabel } from './damper-label'
import type { Damper } from '@/lib/types/database'

interface DamperLabelSheetProps {
  dampers: Damper[]
  siteName?: string
}

export function DamperLabelSheet({ dampers, siteName }: DamperLabelSheetProps) {
  useEffect(() => {
    // Give QR codes a moment to render before opening the print dialog
    const t = setTimeout(() => window.print(), 800)
    return () => clearTimeout(t)
  }, [])

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6 flex items-center justify-between print:hidden">
        <div>
          <h1 className="text-xl font-bold">Damper QR Labels</h1>
          <p className="text-sm text-muted-foreground">
            {dampers.length} label{dampers.length === 1 ? '' : 's'}
            {siteName ? ` · ${siteName}` : ''}
          </p>
        </div>
        <Button onClick={() => window.print()}>
          <Printer className="mr-2 h-4 w-4" />
          Print
        </Button>
      </div>

      {dampers.length === 0 ? (
        <p className="text-muted-foreground print:hidden">No dampers to print.</p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 print:grid-cols-2">
          {dampers.map((damper) => (
            <DamperLabel key={damper.id} damper={damper} siteName={siteName} />
          ))}
        </div>
      )}
    </div>
  )
}
