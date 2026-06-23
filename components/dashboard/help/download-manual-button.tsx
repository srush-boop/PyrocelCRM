'use client'

import { Button } from '@/components/ui/button'
import { Download } from 'lucide-react'

interface DownloadManualButtonProps {
  /** Used to name the saved PDF, e.g. "Pyrocel-User-Manual-Engineer". */
  fileName: string
}

export function DownloadManualButton({ fileName }: DownloadManualButtonProps) {
  const handleDownload = () => {
    // Browsers use document.title as the default "Save as PDF" filename, so we
    // swap it in just for the print dialog, then restore it afterwards.
    const previousTitle = document.title
    document.title = fileName

    const restore = () => {
      document.title = previousTitle
      window.removeEventListener('afterprint', restore)
    }
    window.addEventListener('afterprint', restore)

    window.print()

    // Fallback restore in case afterprint doesn't fire (older browsers).
    setTimeout(restore, 1000)
  }

  return (
    <Button onClick={handleDownload} className="print:hidden">
      <Download className="mr-2 h-4 w-4" />
      Download PDF
    </Button>
  )
}
