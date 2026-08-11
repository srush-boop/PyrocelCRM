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

// The filter keys that map 1:1 to an option list from the server.
type OptionFilterKey =
  | 'clientId'
  | 'siteId'
  | 'branchId'
  | 'areaId'
  | 'routeId'
  | 'subcontractorId'
  | 'systemTypeId'
  | 'serviceTypeId'

const WORKER_TYPES: { value: string; label: string }[] = [
  { value: 'cdo', label: 'CDO' },
  { value: 'engineer', label: 'Engineer' },
  { value: 'subcontractor', label: 'Sub-contractor' },
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
  const activeFilterCount = Object.values(filters).filter(
    (v) => v !== undefined && v !== null && v !== '',
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

  const setFilter = (key: keyof GenerateCallsFilters, value: string | null) => {
    setFilters((prev) => {
      const next = { ...prev }
      if (!value || value === ALL) delete next[key]
      else next[key] = value
      return next
    })
    invalidatePreview()
  }

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
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
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

        {/* Assign the whole generated batch to one engineer (optional). */}
        <div className="grid gap-2 py-2">
          <Label htmlFor="assign-engineer">Assign to engineer</Label>
          <Select value={assignEngineerId} onValueChange={setAssignEngineerId}>
            <SelectTrigger id="assign-engineer" disabled={!options || options.engineers.length === 0}>
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
          <p className="text-xs text-muted-foreground">
            Every call created in this run is assigned to the chosen engineer. Leave unassigned to
            allocate them later on the schedule.
          </p>
        </div>

        {/* Optional filters — narrow which services get generated. */}
        <Collapsible open={filtersOpen} onOpenChange={setFiltersOpen}>
          <div className="flex items-center justify-between">
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

          <CollapsibleContent className="pt-2">
            {loadingOptions ? (
              <div className="flex items-center gap-2 px-1 py-4 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading filters…
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <FilterSelect
                  label="Client"
                  value={filters.clientId ?? null}
                  onChange={(v) => setFilter('clientId', v)}
                  options={options?.clients ?? []}
                />
                <FilterSelect
                  label="Site"
                  value={filters.siteId ?? null}
                  onChange={(v) => setFilter('siteId', v)}
                  options={options?.sites ?? []}
                />
                <FilterSelect
                  label="Branch"
                  value={filters.branchId ?? null}
                  onChange={(v) => setFilter('branchId', v)}
                  options={options?.branches ?? []}
                />
                <FilterSelect
                  label="Area"
                  value={filters.areaId ?? null}
                  onChange={(v) => setFilter('areaId', v)}
                  options={options?.areas ?? []}
                />
                <FilterSelect
                  label="Route"
                  value={filters.routeId ?? null}
                  onChange={(v) => setFilter('routeId', v)}
                  options={options?.routes ?? []}
                />
                <FilterSelect
                  label="System type"
                  value={filters.systemTypeId ?? null}
                  onChange={(v) => setFilter('systemTypeId', v)}
                  options={options?.systemTypes ?? []}
                />
                <FilterSelect
                  label="Service type"
                  value={filters.serviceTypeId ?? null}
                  onChange={(v) => setFilter('serviceTypeId', v)}
                  options={options?.serviceTypes ?? []}
                />
                <FilterSelect
                  label="Sub-contractor"
                  value={filters.subcontractorId ?? null}
                  onChange={(v) => setFilter('subcontractorId', v)}
                  options={options?.subcontractors ?? []}
                />
                <div className="grid gap-1.5">
                  <Label className="text-xs text-muted-foreground">Worker type</Label>
                  <Select
                    value={filters.workerType ?? ALL}
                    onValueChange={(v) => setFilter('workerType', v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="All" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ALL}>All</SelectItem>
                      {WORKER_TYPES.map((w) => (
                        <SelectItem key={w.value} value={w.value}>
                          {w.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="due-by" className="text-xs text-muted-foreground">
                    Due by date
                  </Label>
                  <Input
                    id="due-by"
                    type="date"
                    value={filters.dueByDate ?? ''}
                    onChange={(e) => setFilter('dueByDate', e.target.value || null)}
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

/**
 * A single "All / <options>" filter select. Renders disabled with an
 * "All (none)" hint when the option list is empty (e.g. no areas configured).
 */
function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: string | null
  onChange: (value: string | null) => void
  options: { id: string; name: string }[]
}) {
  const empty = options.length === 0
  return (
    <div className="grid gap-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Select value={value ?? ALL} onValueChange={onChange} disabled={empty}>
        <SelectTrigger>
          <SelectValue placeholder="All" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All</SelectItem>
          {options.map((o) => (
            <SelectItem key={o.id} value={o.id}>
              {o.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
