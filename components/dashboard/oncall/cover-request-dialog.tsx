'use client'

import { useState, useTransition } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import { createCoverRequest } from '@/lib/oncall/actions'
import { COVER_KIND_META, formatShiftDate, type CoverKind, type OncallShift } from '@/lib/oncall/types'

interface CoverRequestDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  shift?: OncallShift | null // pre-selected shift when raised from the rota
  myShifts: OncallShift[]
  // A manager (or a user without a home branch) must choose which branch rota
  // the request is aimed at. Engineers use their own branch automatically.
  needsBranch?: boolean
  branches?: { id: string; name: string }[]
}

export function CoverRequestDialog({
  open,
  onOpenChange,
  shift,
  myShifts,
  needsBranch = false,
  branches = [],
}: CoverRequestDialogProps) {
  const [pending, startTransition] = useTransition()
  const [kind, setKind] = useState<CoverKind>(shift ? 'shift_cover' : 'general')
  const [shiftId, setShiftId] = useState<string>(shift?.id ?? '')
  const [branchId, setBranchId] = useState<string>(shift?.branchId ?? '')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [message, setMessage] = useState('')

  const submit = () => {
    if (needsBranch && !shift && !branchId) {
      toast.error('Choose which branch rota to ask')
      return
    }
    startTransition(async () => {
      const res = await createCoverRequest({
        kind,
        shiftId: kind === 'shift_cover' ? shiftId || shift?.id || null : null,
        dateFrom: kind !== 'shift_cover' ? dateFrom || null : null,
        dateTo: kind !== 'shift_cover' ? dateTo || null : null,
        message: message.trim() || null,
        branchId: shift?.branchId ?? (branchId || null),
      })
      if (res.ok) {
        toast.success('Cover request raised — your branch rota has been notified')
        onOpenChange(false)
      } else {
        toast.error(res.error ?? 'Could not raise request')
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Request on-call cover</DialogTitle>
          <DialogDescription>
            {"Ask the rest of your branch's rota to cover a shift or your annual leave. They'll be notified and can accept or message you."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label>Request type</Label>
            <Select value={kind} onValueChange={(v) => setKind(v as CoverKind)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(COVER_KIND_META) as CoverKind[]).map((k) => (
                  <SelectItem key={k} value={k}>
                    {COVER_KIND_META[k].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {needsBranch && !shift && (
            <div className="grid gap-2">
              <Label>Branch rota</Label>
              <Select value={branchId} onValueChange={setBranchId}>
                <SelectTrigger>
                  <SelectValue placeholder="Which branch should cover?" />
                </SelectTrigger>
                <SelectContent>
                  {branches.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {kind === 'shift_cover' && (
            <div className="grid gap-2">
              <Label>Shift</Label>
              <Select value={shiftId} onValueChange={setShiftId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select one of your shifts" />
                </SelectTrigger>
                <SelectContent>
                  {myShifts.length === 0 ? (
                    <SelectItem value="__none__" disabled>
                      You have no upcoming shifts
                    </SelectItem>
                  ) : (
                    myShifts.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {formatShiftDate(s.shiftDate)} — {s.branchName}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
          )}

          {kind !== 'shift_cover' && (
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label htmlFor="cover-from">From</Label>
                <Input id="cover-from" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="cover-to">To</Label>
                <Input id="cover-to" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
              </div>
            </div>
          )}

          <div className="grid gap-2">
            <Label htmlFor="cover-msg">Message (optional)</Label>
            <Textarea
              id="cover-msg"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="e.g. Can anyone cover this Friday? Happy to swap back."
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={pending}>
            Raise request
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
