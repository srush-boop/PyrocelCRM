'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CalendarPlus, Loader2, Eye, History } from 'lucide-react'
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
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  generateMonthlyCalls,
  previewMonthlyCalls,
  type PlannedCall,
} from '@/app/(dashboard)/dashboard/schedule/generate-actions'

interface MonthOption {
  value: string
  label: string
  year: number
  month: number
  retro: boolean
}

/**
 * Build the selectable months: 6 months back (retrospective, to back-fill late
 * contracts or a site that missed its generate) through the current month and
 * 12 months ahead. Defaults to the next calendar month.
 */
function buildMonthOptions(): MonthOption[] {
  const now = new Date()
  const options: MonthOption[] = []
  for (let i = -6; i <= 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1)
    options.push({
      value: `${d.getFullYear()}-${d.getMonth() + 1}`,
      label: d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }),
      year: d.getFullYear(),
      month: d.getMonth() + 1,
      retro: i < 0,
    })
  }
  return options
}

function formatCallDate(dateStr: string) {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, (m ?? 1) - 1, d ?? 1).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
}

export function GenerateCallsButton() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [previewing, setPreviewing] = useState(false)
  // The preview list for the currently-selected month, or null before a run.
  const [preview, setPreview] = useState<PlannedCall[] | null>(null)
  const [previewSkipped, setPreviewSkipped] = useState(0)
  const monthOptions = buildMonthOptions()
  // Default to the next calendar month (index 7 = current + 1 after 6 retro).
  const defaultValue = monthOptions[7]?.value ?? monthOptions[0]?.value ?? ''
  const [selected, setSelected] = useState(defaultValue)

  const selectedOption = monthOptions.find((o) => o.value === selected)
  const retroMonths = monthOptions.filter((o) => o.retro)
  const forwardMonths = monthOptions.filter((o) => !o.retro)

  // Any change of month invalidates a stale preview.
  const handleSelect = (value: string) => {
    setSelected(value)
    setPreview(null)
    setPreviewSkipped(0)
  }

  const handlePreview = async () => {
    if (!selectedOption) return
    setPreviewing(true)
    try {
      const result = await previewMonthlyCalls(selectedOption.year, selectedOption.month)
      if (!result.ok) {
        toast.error(result.error ?? 'Could not preview calls.')
        return
      }
      setPreview(result.calls)
      setPreviewSkipped(result.skipped)
    } catch {
      toast.error('Something went wrong previewing calls.')
    } finally {
      setPreviewing(false)
    }
  }

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
      setPreview(null)
      router.refresh()
    } catch {
      toast.error('Something went wrong generating calls.')
    } finally {
      setSubmitting(false)
    }
  }

  const busy = submitting || previewing

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (!o) {
          setPreview(null)
          setPreviewSkipped(0)
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline">
          <CalendarPlus className="mr-2 h-4 w-4" />
          Generate Calls
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Generate monthly calls</DialogTitle>
          <DialogDescription>
            Create the recurring calls that fall due in the selected month. This fills any gaps
            and never duplicates calls that are already scheduled, so it&apos;s safe to run more
            than once. Pick a past month to back-fill a late contract or a site that missed its
            generate.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-2 py-2">
          <Label htmlFor="generate-month">Target month</Label>
          <Select value={selected} onValueChange={handleSelect}>
            <SelectTrigger id="generate-month">
              <SelectValue placeholder="Select a month" />
            </SelectTrigger>
            <SelectContent>
              {retroMonths.length > 0 && (
                <>
                  {retroMonths.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      <span className="flex items-center gap-2">
                        <History className="h-3.5 w-3.5 text-muted-foreground" />
                        {o.label}
                      </span>
                    </SelectItem>
                  ))}
                  <SelectSeparator />
                </>
              )}
              {forwardMonths.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            {selectedOption?.retro
              ? 'Retrospective month. Due dates use each service’s real cadence date, even if it has already passed.'
              : 'Due dates are rolled forward from each service’s fixed visit frequency.'}
          </p>
        </div>

        {preview !== null && (
          <div className="rounded-md border">
            <div className="flex items-center justify-between border-b bg-muted/40 px-3 py-2">
              <span className="text-sm font-medium">
                {preview.length === 0
                  ? 'No new calls to create'
                  : `${preview.length} call${preview.length === 1 ? '' : 's'} will be created`}
              </span>
              {previewSkipped > 0 && (
                <span className="text-xs text-muted-foreground">
                  {previewSkipped} already scheduled
                </span>
              )}
            </div>
            {preview.length > 0 && (
              <ul className="max-h-56 divide-y overflow-y-auto">
                {preview.map((c) => (
                  <li
                    key={`${c.siteServiceId}|${c.visitTypeId ?? 'none'}`}
                    className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{c.siteName}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {c.serviceTypeName}
                        {c.visitLabel ? ` — ${c.visitLabel}` : ''}
                      </span>
                    </span>
                    <span className="shrink-0 whitespace-nowrap text-xs text-muted-foreground">
                      {formatCallDate(c.scheduledDate)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="secondary"
            onClick={handlePreview}
            disabled={busy || !selectedOption}
          >
            {previewing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Previewing…
              </>
            ) : (
              <>
                <Eye className="mr-2 h-4 w-4" />
                Preview
              </>
            )}
          </Button>
          <Button onClick={handleGenerate} disabled={busy || !selectedOption}>
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
