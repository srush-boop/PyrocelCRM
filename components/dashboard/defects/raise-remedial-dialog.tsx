'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Wrench, Loader2, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'
import { createRemedialCallFromDefect } from '@/app/(dashboard)/dashboard/defects/actions'
import type { DefectSuggestedPart } from '@/lib/defects/suggested-parts'
import {
  SuggestedPartsReview,
  type SuggestedPartDecision,
} from '@/components/dashboard/defects/suggested-parts-review'

export interface RemedialEngineerOption {
  id: string
  name: string
}

/** Local YYYY-MM-DD for the date input default (today). */
function todayIso(): string {
  const now = new Date()
  const tz = now.getTimezoneOffset() * 60000
  return new Date(now.getTime() - tz).toISOString().slice(0, 10)
}

/**
 * Raise a chargeable remedial call directly from a defect. The office picks the
 * engineer + scheduled date; the server anchors the call to the defect's service
 * (or site) and seeds it from the failed checks.
 */
export function RaiseRemedialDialog({
  defectId,
  engineers,
  suggestedParts = [],
}: {
  defectId: string
  engineers: RemedialEngineerOption[]
  suggestedParts?: DefectSuggestedPart[]
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [engineerId, setEngineerId] = useState('')
  const [scheduledDate, setScheduledDate] = useState(todayIso())
  const [decisions, setDecisions] = useState<Record<string, SuggestedPartDecision | undefined>>({})
  const [isPending, startTransition] = useTransition()

  function submit() {
    if (!engineerId) {
      toast.error('Choose an engineer')
      return
    }
    const confirmedPartIds = suggestedParts
      .filter((p) => decisions[p.partId] === 'confirmed')
      .map((p) => p.partId)
    startTransition(async () => {
      const res = await createRemedialCallFromDefect(defectId, {
        engineerId,
        scheduledDate,
        confirmedPartIds,
      })
      if (!res.ok) {
        toast.error(res.error ?? 'Could not raise remedial call')
        return
      }
      setOpen(false)
      toast.success('Remedial call raised', {
        action: res.taskId
          ? {
              label: 'Open call',
              onClick: () => router.push(`/dashboard/tasks/${res.taskId}`),
            }
          : undefined,
      })
      router.refresh()
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Wrench className="mr-2 h-4 w-4" />
          Raise remedial call
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Raise remedial call</DialogTitle>
          <DialogDescription>
            Creates a chargeable call against this defect&apos;s service, seeded from its failed
            checks. Choose who attends and when.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="remedial-engineer">Engineer</Label>
            <Select value={engineerId} onValueChange={setEngineerId}>
              <SelectTrigger id="remedial-engineer">
                <SelectValue placeholder="Select an engineer…" />
              </SelectTrigger>
              <SelectContent>
                {engineers.length === 0 ? (
                  <div className="px-2 py-1.5 text-sm text-muted-foreground">
                    No active engineers
                  </div>
                ) : (
                  engineers.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.name}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="remedial-date">Scheduled date</Label>
            <Input
              id="remedial-date"
              type="date"
              value={scheduledDate}
              onChange={(e) => setScheduledDate(e.target.value)}
            />
          </div>
          {suggestedParts.length > 0 && (
            <div className="flex flex-col gap-2">
              <div>
                <p className="text-sm font-medium">Suggested parts</p>
                <p className="text-xs text-muted-foreground">
                  Confirm the parts the engineer suggested to add them to this call. Removed parts
                  are left off.
                </p>
              </div>
              <SuggestedPartsReview
                parts={suggestedParts}
                decisions={decisions}
                disabled={isPending}
                onDecide={(p, decision) =>
                  setDecisions((prev) => ({ ...prev, [p.partId]: decision ?? undefined }))
                }
              />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={isPending || !engineerId}>
            {isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <ExternalLink className="mr-2 h-4 w-4" />
            )}
            Raise call
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
