'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { FileSpreadsheet, Loader2 } from 'lucide-react'
import { exportInvoicesToSage } from '@/lib/actions/invoices'

// Header action: pushes all issued invoices not yet exported into a Sage 50 CSV,
// downloads it, and marks those invoices as "Sent to Sage".
export function PushToSageButton({ pendingCount }: { pendingCount: number }) {
  const router = useRouter()
  const [confirm, setConfirm] = useState(false)
  const [pending, startTransition] = useTransition()
  const disabled = pendingCount === 0 || pending

  const run = () => {
    setConfirm(false)
    startTransition(async () => {
      const res = await exportInvoicesToSage()
      if (res.error || !res.csv) {
        toast.error(res.error ?? 'Could not build the Sage export.')
        return
      }
      // Trigger a client-side download of the CSV the action returned.
      // Prepend a UTF-8 BOM so Excel/Sage on Windows detect the encoding and
      // don't mangle any remaining non-ASCII characters.
      const blob = new Blob(['\uFEFF' + res.csv], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = res.filename ?? 'sage-export.csv'
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      toast.success(
        `Pushed ${res.count} invoice${res.count === 1 ? '' : 's'} to Sage. CSV downloaded.`,
      )
      router.refresh()
    })
  }

  return (
    <>
      <Button variant="outline" onClick={() => setConfirm(true)} disabled={disabled}>
        {pending ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <FileSpreadsheet className="mr-2 h-4 w-4" />
        )}
        Push to Sage
        {pendingCount > 0 && (
          <Badge variant="secondary" className="ml-2">
            {pendingCount}
          </Badge>
        )}
      </Button>

      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Push {pendingCount} invoice{pendingCount === 1 ? '' : 's'} to Sage?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This downloads a Sage 50 CSV containing every issued invoice not yet exported, with
              one row per line (posted to its nominal code). The invoices are then labelled
              <span className="font-medium"> Sent to Sage</span>. Import the file into Sage via File
              &rarr; Import &rarr; Audit Trail transactions.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                run()
              }}
            >
              <FileSpreadsheet className="mr-2 h-4 w-4" />
              Download CSV
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
