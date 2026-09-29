'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ChevronDown, Plus, User, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { cn } from '@/lib/utils'
import { formatPence } from '@/lib/billing/invoices'
import { AREA_COLORS, prefixLevel } from '@/lib/areas/postcodes'
import { setAreaColor } from '@/lib/actions/areas'
import type { PlannerArea, PlannerRule } from '@/lib/areas/planner-data'

export interface AreaSummary {
  area: PlannerArea
  rules: PlannerRule[]
  revenuePence: number
  serviceCount: number
  siteCount: number
  byServiceType: { name: string; count: number; pence: number }[]
  notAllocatedCount: number
  notAllocatedPence: number
}

export function AreaPlannerCard({
  summary,
  selected,
  pending,
  onSelect,
  onAddPrefix,
  onRemoveRule,
}: {
  summary: AreaSummary
  selected: boolean
  pending: boolean
  onSelect: () => void
  onAddPrefix: (prefix: string) => void
  onRemoveRule: (ruleId: string, prefix: string) => void
}) {
  const { area } = summary
  const router = useRouter()
  const [prefix, setPrefix] = useState('')
  const [colorPending, startColor] = useTransition()

  const submit = () => {
    if (!prefix.trim()) return
    onAddPrefix(prefix)
    setPrefix('')
  }

  const pickColor = (color: string) =>
    startColor(async () => {
      const res = await setAreaColor(area.id, color)
      if (!res.ok) toast.error(res.error ?? 'Could not change colour')
      else router.refresh()
    })

  return (
    <div
      className={cn(
        'rounded-lg border bg-card transition-shadow',
        selected && 'ring-2 ring-offset-1 ring-offset-background',
      )}
      style={selected ? ({ '--tw-ring-color': area.color } as React.CSSProperties) : undefined}
    >
      <div className="flex items-start gap-3 p-4 pb-3">
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label={`Change colour for ${area.name}`}
              disabled={colorPending}
              className="mt-1 h-4 w-4 shrink-0 rounded-full border border-background shadow-[0_0_0_1px] shadow-border"
              style={{ backgroundColor: area.color }}
            />
          </PopoverTrigger>
          <PopoverContent className="w-auto p-2" align="start">
            <div className="grid grid-cols-5 gap-2">
              {AREA_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={`Use colour ${c}`}
                  onClick={() => pickColor(c)}
                  className={cn('h-6 w-6 rounded-full', c === area.color && 'ring-2 ring-foreground ring-offset-2')}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </PopoverContent>
        </Popover>

        <button type="button" onClick={onSelect} className="min-w-0 flex-1 text-left" aria-pressed={selected}>
          <div className="flex items-baseline justify-between gap-2">
            <span className="truncate font-semibold">{area.name}</span>
            <span className="shrink-0 font-semibold tabular-nums">{formatPence(summary.revenuePence)}</span>
          </div>
          <div className="mt-0.5 flex items-center justify-between gap-2 text-xs text-muted-foreground">
            <span className="flex min-w-0 items-center gap-1">
              <User className="h-3 w-3 shrink-0" aria-hidden />
              <span className="truncate">{area.assignedEngineerName ?? 'No worker assigned'}</span>
            </span>
            <span className="shrink-0">
              {summary.serviceCount} service{summary.serviceCount === 1 ? '' : 's'} · {summary.siteCount} site
              {summary.siteCount === 1 ? '' : 's'}
            </span>
          </div>
        </button>
      </div>

      <div className="flex flex-col gap-3 px-4 pb-4">
        <div className="flex flex-wrap gap-1.5">
          {summary.rules.length === 0 && (
            <span className="text-xs text-muted-foreground">No postcodes yet. Add one below.</span>
          )}
          {summary.rules.map((r) => (
            <span
              key={r.id}
              className="flex items-center gap-1 rounded-md bg-secondary py-0.5 pl-2 pr-1 text-xs font-medium text-secondary-foreground"
              title={`${prefixLevel(r.prefix)} rule`}
            >
              {r.prefix}
              <button
                type="button"
                aria-label={`Remove ${r.prefix}`}
                disabled={pending}
                onClick={() => onRemoveRule(r.id, r.prefix)}
                className="rounded p-0.5 hover:bg-background"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>

        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            submit()
          }}
        >
          <Input
            value={prefix}
            onChange={(e) => setPrefix(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.nativeEvent.isComposing || e.keyCode === 229)) e.preventDefault()
            }}
            placeholder="Add postcode, e.g. NE2 or NE2 4"
            aria-label={`Add postcode to ${area.name}`}
            className="h-8 text-sm"
          />
          <Button type="submit" size="sm" variant="outline" disabled={pending || !prefix.trim()}>
            <Plus className="h-4 w-4" aria-hidden />
            <span className="sr-only">Add</span>
          </Button>
        </form>

        {summary.notAllocatedCount > 0 && (
          <p className="text-xs text-muted-foreground">
            {summary.notAllocatedCount} engineer service{summary.notAllocatedCount === 1 ? '' : 's'} (
            {formatPence(summary.notAllocatedPence)}/yr) in these postcodes {summary.notAllocatedCount === 1 ? "isn't" : "aren't"} allocated to this area.
          </p>
        )}

        {summary.byServiceType.length > 0 && (
          <Collapsible>
            <CollapsibleTrigger className="group flex w-full items-center justify-between text-xs font-medium text-muted-foreground hover:text-foreground">
              Revenue by service type
              <ChevronDown className="h-3.5 w-3.5 transition-transform group-data-[state=open]:rotate-180" aria-hidden />
            </CollapsibleTrigger>
            <CollapsibleContent>
              <ul className="mt-2 flex flex-col divide-y text-sm">
                {summary.byServiceType.map((t) => (
                  <li key={t.name} className="flex items-center justify-between gap-2 py-1.5">
                    <span className="min-w-0 truncate">
                      {t.name} <span className="text-xs text-muted-foreground">×{t.count}</span>
                    </span>
                    <span className="shrink-0 tabular-nums">{formatPence(t.pence)}</span>
                  </li>
                ))}
              </ul>
            </CollapsibleContent>
          </Collapsible>
        )}
      </div>
    </div>
  )
}
