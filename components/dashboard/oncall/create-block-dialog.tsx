'use client'

import { useMemo, useState, useTransition } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Checkbox } from '@/components/ui/checkbox'
import { toast } from 'sonner'
import { ArrowDown, ArrowUp, CalendarRange } from 'lucide-react'
import { generateRotaBlock } from '@/lib/oncall/actions'
import type { RotaMember } from '@/lib/oncall/types'

interface CreateBlockDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  branchId: string
  branchName: string
  members: RotaMember[]
}

interface OrderRow {
  engineerId: string
  name: string
  included: boolean
}

export function CreateBlockDialog({
  open,
  onOpenChange,
  branchId,
  branchName,
  members,
}: CreateBlockDialogProps) {
  const [pending, startTransition] = useTransition()
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [unit, setUnit] = useState<'day' | 'week'>('week')

  // Seed the rotation order from the branch's active rota members, in their
  // current order. Managers can reorder and exclude before generating.
  const initialRows = useMemo<OrderRow[]>(
    () =>
      members
        .filter((m) => m.active)
        .map((m) => ({
          engineerId: m.engineerId,
          name: m.engineer?.fullName ?? 'Engineer',
          included: true,
        })),
    [members],
  )
  const [rows, setRows] = useState<OrderRow[]>(initialRows)

  // Re-seed whenever the dialog is (re)opened for a branch.
  const [seededFor, setSeededFor] = useState(branchId)
  if (open && seededFor !== branchId) {
    setRows(initialRows)
    setSeededFor(branchId)
  }

  const move = (index: number, delta: number) => {
    setRows((prev) => {
      const next = [...prev]
      const target = index + delta
      if (target < 0 || target >= next.length) return prev
      ;[next[index], next[target]] = [next[target], next[index]]
      return next
    })
  }

  const toggle = (engineerId: string, included: boolean) => {
    setRows((prev) => prev.map((r) => (r.engineerId === engineerId ? { ...r, included } : r)))
  }

  const orderedIds = rows.filter((r) => r.included).map((r) => r.engineerId)

  const handleCreate = () => {
    if (!startDate || !endDate) {
      toast.error('Enter a start and end date')
      return
    }
    if (startDate > endDate) {
      toast.error('The end date must be on or after the start date')
      return
    }
    if (orderedIds.length === 0) {
      toast.error('Include at least one engineer in the rotation')
      return
    }
    startTransition(async () => {
      const res = await generateRotaBlock({ branchId, startDate, endDate, unit, order: orderedIds })
      if (res.ok) {
        toast.success(`Block created — ${res.created ?? 0} shifts scheduled`)
        onOpenChange(false)
      } else {
        toast.error(res.error ?? 'Could not create the block')
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarRange className="h-5 w-5" />
            Create rota block
          </DialogTitle>
          <DialogDescription>
            Lay down a repeating schedule for <strong>{branchName}</strong>. The order below is
            cycled from the start date to the end date and{' '}
            <strong>overwrites any existing shifts</strong> in that window.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="block-start">Start date</Label>
              <Input
                id="block-start"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="block-end">End date</Label>
              <Input
                id="block-end"
                type="date"
                value={endDate}
                min={startDate || undefined}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label>Rotate every</Label>
            <RadioGroup
              value={unit}
              onValueChange={(v) => setUnit(v as 'day' | 'week')}
              className="flex gap-6"
            >
              <div className="flex items-center gap-2">
                <RadioGroupItem value="week" id="unit-week" />
                <Label htmlFor="unit-week" className="font-normal">
                  Week
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="day" id="unit-day" />
                <Label htmlFor="unit-day" className="font-normal">
                  Day
                </Label>
              </div>
            </RadioGroup>
            <p className="text-xs text-muted-foreground">
              {unit === 'week'
                ? 'Each engineer covers a full week before handing over to the next in the order.'
                : 'The rota advances to the next engineer every day.'}
            </p>
          </div>

          <div className="grid gap-1.5">
            <Label>Rotation order</Label>
            {rows.length === 0 ? (
              <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
                No active engineers on this branch&apos;s rota. Add them under the{' '}
                <strong>Rota members</strong> tab first.
              </p>
            ) : (
              <ul className="divide-y rounded-md border">
                {rows.map((r, i) => (
                  <li key={r.engineerId} className="flex items-center gap-2 px-3 py-2">
                    <Checkbox
                      checked={r.included}
                      onCheckedChange={(v) => toggle(r.engineerId, v === true)}
                      aria-label={`Include ${r.name}`}
                    />
                    <span className="w-6 text-xs text-muted-foreground">{i + 1}.</span>
                    <span className={`flex-1 text-sm ${r.included ? 'font-medium' : 'text-muted-foreground line-through'}`}>
                      {r.name}
                    </span>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      onClick={() => move(i, -1)}
                      disabled={i === 0}
                      aria-label={`Move ${r.name} up`}
                    >
                      <ArrowUp className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      onClick={() => move(i, 1)}
                      disabled={i === rows.length - 1}
                      aria-label={`Move ${r.name} down`}
                    >
                      <ArrowDown className="h-4 w-4" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={pending || orderedIds.length === 0}>
            {pending ? 'Creating…' : 'Create block'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
