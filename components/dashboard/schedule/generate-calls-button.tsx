'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { CalendarPlus, Loader2, Eye, History, SlidersHorizontal, X } from 'lucide-react'
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
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  generateMonthlyCalls,
  previewMonthlyCalls,
  getGenerateCallsFilterOptions,
  type PlannedCall,
  type GenerateCallsFilters,
  type GenerateCallsFilterOptions,
} from '@/app/(dashboard)/dashboard/schedule/generate-actions'
import { MultiSelectFilter } from '@/components/dashboard/schedule/multi-select-filter'

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

const ALL = '__all__'

type ListFilterKey = Exclude<keyof GenerateCallsFilters, 'dueByDate'>

const WORKER_TYPES: { id: string; name: string }[] = [
  { id: 'cdo', name: 'CDO' },
  { id: 'engineer', name: 'Engineer' },
  { id: 'subcontractor', name: 'Sub-contractor' },
]

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

  // Optional engineer to assign every generated call to (batch-wide).
  const [assignEngineerId, setAssignEngineerId] = useState<string>(ALL)

  // Filters
  const [filters, setFilters] = useState<GenerateCallsFilters>({})
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [options, setOptions] = useState<GenerateCallsFilterOptions | null>(null)
  const [loadingOptions, setLoadingOptions] = useState(false)

  const selectedOption = monthOptions.find((o) => o.value === selected)
  const retroMonths = monthOptions.filter((o) => o.retro)
  const forwardMonths = monthOptions.filter((o) => !o.retro)

  // Load the filter option lists once, the first time the dialog opens.
  useEffect(() => {
    if (!open || options || loadingOptions) return
    setLoadingOptions(true)
    getGenerateCallsFilterOptions()
      .then((res) => {
        if (res.ok) setOptions(res.options)
      })
      .catch(() => {
        /* non-fatal: filters simply stay unavailable */
      })
      .finally(() => setLoadingOptions(false))
  }, [open, options, loadingOptions])

  // Number of active filters (for the badge on the Filters toggle).
  const activeFilterCount = Object.values(filters).filter((v) =>
    Array.isArray(v) ? v.length > 0 : Boolean(v),
  ).length

  const invalidatePreview = () => {
    setPreview(null)
    setPreviewSkipped(0)
  }

  // Any change of month or filter invalidates a stale preview.
  const handleSelect = (value: string) => {
    setSelected(value)
    invalidatePreview()
  }

  const setListFilter = (key: ListFilterKey, value: string[]) => {
    setFilters((prev) => {
      const next = { ...prev }
      if (value.length === 0) delete next[key]
      else next[key] = value
      return next
    })
    invalidatePreview()
  }

  const setDueByDate = (value: string) => {
    setFilters((prev) => {
      const next = { ...prev }
      if (value) next.dueByDate = value
      else delete next.dueByDate
      return next
    })
    invalidatePreview()
  }

  const listFilters: { key: ListFilterKey; label: string; options: { id: string; name: string }[] }[] = [
    { key: 'clientIds', label: 'Client', options: options?.clients ?? [] },
    { key: 'siteIds', label: 'Site', options: options?.sites ?? [] },
    { key: 'branchIds', label: 'Branch', options: options?.branches ?? [] },
    { key: 'areaIds', label: 'Area', options: options?.areas ?? [] },
    { key: 'routeIds', label: 'Route', options: options?.routes ?? [] },
    { key: 'systemTypeIds', label: 'System type', options: options?.systemTypes ?? [] },
    { key: 'serviceTypeIds', label: 'Service type', options: options?.serviceTypes ?? [] },
    { key: 'subcontractorIds', label: 'Sub-contractor', options: options?.subcontractors ?? [] },
    { key: 'workerTypes', label: 'Worker type', options: WORKER_TYPES },
  ]

  const clearFilters = () => {
    setFilters({})
    invalidatePreview()
  }

  const handlePreview = async () => {
    if (!selectedOption) return
    setPreviewing(true)
    try {
      const result = await previewMonthlyCalls(
        selectedOption.year,
        selectedOption.month,
        filters,
      )
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
      const result = await generateMonthlyCalls(
        selectedOption.year,
        selectedOption.month,
        filters,
        assignEngineerId === ALL ? null : assignEngineerId,
      )
      if (!result.ok) {
        toast.error(result.error ?? 'Could not generate calls.')
        return
      }
      if (result.created === 0) {
        toast.info(
          `No new calls needed for ${result.monthLabel} — everything due is already scheduled.`,
        )
      } else {
        const engineerName =
          assignEngineerId !== ALL
            ? options?.engineers.find((e) => e.id === assignEngineerId)?.name
            : null
        toast.success(
          `Created ${result.created} call${result.created === 1 ? '' : 's'} for ${result.monthLabel}` +
            (engineerName ? `, assigned to ${engineerName}` : '') +
            '.' +
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
          setAssignEngineerId(ALL)
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline">
          <CalendarPlus className="mr-2 h-4 w-4" />
          Generate Calls
        </Button>
      </DialogTrigger>
      <DialogContent className="flex max-h-[90vh] flex-col gap-0 p-0 sm:max-w-3xl">
        <DialogHeader className="border-b px-6 pb-4 pt-6 text-left">
          <DialogTitle>Generate monthly calls</DialogTitle>
          <DialogDescription className="text-pretty">
            Create the recurring calls that fall due in the selected month. This fills any gaps
            and never duplicates calls that are already scheduled, so it&apos;s safe to run more
            than once. Pick a past month to back-fill a late contract or a site that missed its
            generate.
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-6 py-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-2">
          <Label htmlFor="generate-month">Target month</Label>
          <Select value={selected} onValueChange={handleSelect}>
            <SelectTrigger id="generate-month" className="w-full">
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
          <p className="text-xs leading-relaxed text-muted-foreground">
            {selectedOption?.retro
              ? 'Retrospective month. Due dates use each service’s real cadence date, even if it has already passed.'
              : 'Due dates are rolled forward from each service’s fixed visit frequency.'}
          </p>
        </div>

        {/* Assign the whole generated batch to one engineer (optional). */}
        <div className="flex min-w-0 flex-col gap-2">
          <Label htmlFor="assign-engineer">Assign to engineer</Label>
          <Select value={assignEngineerId} onValueChange={setAssignEngineerId}>
            <SelectTrigger
              id="assign-engineer"
              className="w-full"
              disabled={!options || options.engineers.length === 0}
            >
              <SelectValue placeholder="Leave unassigned" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Leave unassigned</SelectItem>
              {(options?.engineers ?? []).map((e) => (
                <SelectItem key={e.id} value={e.id}>
                  {e.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Every call created in this run is assigned to the chosen engineer. Leave unassigned to
            allocate them later on the schedule.
          </p>
        </div>
        </div>

        {/* Optional filters — narrow which services get generated. */}
        <Collapsible
          open={filtersOpen}
          onOpenChange={setFiltersOpen}
          className="rounded-lg border bg-muted/30"
        >
          <div className="flex items-center justify-between px-2 py-1.5">
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="gap-2 px-2">
                <SlidersHorizontal className="h-4 w-4" />
                Filters
                {activeFilterCount > 0 && (
                  <Badge variant="secondary" className="ml-1">
                    {activeFilterCount}
                  </Badge>
                )}
              </Button>
            </CollapsibleTrigger>
            {activeFilterCount > 0 && (
              <Button variant="ghost" size="sm" className="gap-1 text-muted-foreground" onClick={clearFilters}>
                <X className="h-3.5 w-3.5" />
                Clear
              </Button>
            )}
          </div>

          <CollapsibleContent className="border-t px-4 pb-4 pt-3">
            {loadingOptions ? (
              <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading filters…
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
                {listFilters.map((f) => (
                  <MultiSelectFilter
                    key={f.key}
                    id={`gen-filter-${f.key}`}
                    label={f.label}
                    options={f.options}
                    value={filters[f.key] ?? []}
                    onChange={(v) => setListFilter(f.key, v)}
                  />
                ))}
                <div className="flex min-w-0 flex-col gap-1.5">
                  <Label htmlFor="due-by" className="text-xs text-muted-foreground">
                    Due by date
                  </Label>
                  <Input
                    id="due-by"
                    type="date"
                    className="w-full"
                    value={filters.dueByDate ?? ''}
                    onChange={(e) => setDueByDate(e.target.value)}
                  />
                </div>
              </div>
            )}
          </CollapsibleContent>
        </Collapsible>

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

        </div>

        <DialogFooter className="gap-2 border-t px-6 py-4 sm:gap-2">
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

