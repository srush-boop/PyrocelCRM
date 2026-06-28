'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CalendarPlus, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
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
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { generateMonthlyCalls } from '@/app/(dashboard)/dashboard/schedule/generate-actions'

/** Build the next 12 month options, defaulting to the next calendar month. */
function buildMonthOptions() {
  const now = new Date()
  const options: { value: string; label: string; year: number; month: number }[] = []
  for (let i = 1; i <= 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1)
    const year = d.getFullYear()
    const month = d.getMonth() + 1
    options.push({
      value: `${year}-${month}`,
      label: d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }),
      year,
      month,
    })
  }
  return options
}

export function GenerateCallsButton() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const monthOptions = buildMonthOptions()
  // Default to the next calendar month.
  const [selected, setSelected] = useState(monthOptions[0]?.value ?? '')

  const selectedOption = monthOptions.find((o) => o.value === selected)

  const handleGenerate = async () => {
    if (!selectedOption) return
    setSubmitting(true)
    try {
      const result = await generateMonthlyCalls(selectedOption.year, selectedOption.month)
      if (!result.ok) {
        toast.error(result.error ?? 'Could not generate calls.')
        return
      }
      if (result.created === 0) {
        toast.info(
          `No new calls needed for ${result.monthLabel} — everything due is already scheduled.`,
        )
      } else {
        toast.success(
          `Created ${result.created} call${result.created === 1 ? '' : 's'} for ${result.monthLabel}.` +
            (result.skipped > 0 ? ` (${result.skipped} already scheduled)` : ''),
        )
      }
      setOpen(false)
      router.refresh()
    } catch {
      toast.error('Something went wrong generating calls.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <CalendarPlus className="mr-2 h-4 w-4" />
          Generate Calls
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Generate monthly calls</DialogTitle>
          <DialogDescription>
            Create the recurring calls that fall due in the selected month. This fills any
            gaps and never duplicates calls that are already scheduled, so it&apos;s safe to
            run more than once.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-2 py-2">
          <Label htmlFor="generate-month">Target month</Label>
          <Select value={selected} onValueChange={setSelected}>
            <SelectTrigger id="generate-month">
              <SelectValue placeholder="Select a month" />
            </SelectTrigger>
            <SelectContent>
              {monthOptions.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Defaults to next month. Due dates are rolled forward from each service&apos;s
            fixed visit frequency.
          </p>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => setOpen(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleGenerate} disabled={submitting || !selectedOption}>
            {submitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Generating…
              </>
            ) : (
              <>Generate {selectedOption ? selectedOption.label : 'calls'}</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
