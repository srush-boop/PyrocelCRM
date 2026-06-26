'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { CheckCircle2, XCircle, RotateCcw } from 'lucide-react'
import { toast } from 'sonner'
import { setDefectStatus } from '@/app/(dashboard)/dashboard/defects/actions'
import type { DefectStatus } from '@/lib/types/database'

export function DefectStatusActions({
  defectId,
  status,
}: {
  defectId: string
  status: DefectStatus
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function update(next: DefectStatus, successMsg: string) {
    startTransition(async () => {
      const res = await setDefectStatus(defectId, next)
      if (res.ok) {
        toast.success(successMsg)
        router.refresh()
      } else {
        toast.error(res.error ?? 'Could not update defect')
      }
    })
  }

  const isClosed = status === 'resolved' || status === 'dismissed'

  return (
    <div className="flex flex-wrap gap-2">
      {!isClosed && (
        <>
          <Button
            variant="outline"
            size="sm"
            disabled={isPending}
            onClick={() => update('resolved', 'Defect marked resolved')}
          >
            <CheckCircle2 className="mr-2 h-4 w-4" />
            Mark resolved
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={isPending}
            onClick={() => update('dismissed', 'Defect dismissed')}
          >
            <XCircle className="mr-2 h-4 w-4" />
            Dismiss
          </Button>
        </>
      )}
      {isClosed && (
        <Button
          variant="outline"
          size="sm"
          disabled={isPending}
          onClick={() => update('open', 'Defect reopened')}
        >
          <RotateCcw className="mr-2 h-4 w-4" />
          Reopen
        </Button>
      )}
    </div>
  )
}
