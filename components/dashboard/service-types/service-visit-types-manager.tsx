'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  ArrowDown,
  ArrowUp,
  ClipboardList,
  ExternalLink,
  Loader2,
  Plus,
  Trash2,
} from 'lucide-react'
import type { ChecklistTemplate, ServiceVisitType } from '@/lib/types/database'

interface ServiceVisitTypesManagerProps {
  serviceTypeId: string
  /** The whole-cycle frequency, used to explain how visits are spaced. */
  frequencyValue: number
  frequencyUnit: 'weeks' | 'months'
}

// Describe how the cycle is split given a number of visits, e.g.
// "every 6 months" for a 12-month cycle with 2 visits.
function describeSpacing(value: number, unit: 'weeks' | 'months', visits: number): string {
  if (visits <= 1) return `once every ${value} ${unit}`
  const each = value / visits
  const rounded = Number.isInteger(each) ? String(each) : each.toFixed(1)
  return `one visit every ${rounded} ${unit}`
}

export function ServiceVisitTypesManager({
  serviceTypeId,
  frequencyValue,
  frequencyUnit,
}: ServiceVisitTypesManagerProps) {
  const supabase = createClient()
  const [visits, setVisits] = useState<ServiceVisitType[]>([])
  // Checklist template (if any) keyed by visit_type_id, so each visit shows its
  // own checklist name + item count and an "Edit items" link.
  const [checklistsByVisit, setChecklistsByVisit] = useState<
    Record<string, { id: string; name: string; itemCount: number }>
  >({})
  const [loading, setLoading] = useState(true)
  const [newName, setNewName] = useState('')
  const [busy, setBusy] = useState(false)

  const loadChecklists = useCallback(async () => {
    const { data } = await supabase
      .from('checklist_templates')
      .select('id, name, items, visit_type_id')
      .eq('service_type_id', serviceTypeId)
      .not('visit_type_id', 'is', null)
    const map: Record<string, { id: string; name: string; itemCount: number }> = {}
    for (const row of (data || []) as (ChecklistTemplate & { visit_type_id: string })[]) {
      map[row.visit_type_id] = {
        id: row.id,
        name: row.name,
        itemCount: Array.isArray(row.items) ? row.items.length : 0,
      }
    }
    setChecklistsByVisit(map)
  }, [supabase, serviceTypeId])

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('service_visit_types')
      .select('*')
      .eq('service_type_id', serviceTypeId)
      .order('sort_order', { ascending: true })
    setVisits((data || []) as ServiceVisitType[])
    await loadChecklists()
    setLoading(false)
  }, [supabase, serviceTypeId, loadChecklists])

  useEffect(() => {
    load()
  }, [load])

  // Refresh checklist counts when the user returns from editing items in
  // another tab (the editor opens in a new tab to preserve this dialog).
  useEffect(() => {
    const onFocus = () => loadChecklists()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [loadChecklists])

  const createChecklist = async (visit: ServiceVisitType) => {
    setBusy(true)
    const { data } = await supabase
      .from('checklist_templates')
      .insert({
        service_type_id: serviceTypeId,
        visit_type_id: visit.id,
        name: `${visit.name} Checklist`,
        items: [],
      })
      .select('id, name, items')
      .single()
    if (data) {
      setChecklistsByVisit((prev) => ({
        ...prev,
        [visit.id]: { id: data.id, name: data.name, itemCount: 0 },
      }))
      // Open the full checklist editor in a new tab so this dialog stays open.
      window.open(`/dashboard/checklists/${data.id}`, '_blank')
    }
    setBusy(false)
  }

  const removeChecklist = async (visitId: string, checklistId: string) => {
    setBusy(true)
    await supabase.from('checklist_templates').delete().eq('id', checklistId)
    setChecklistsByVisit((prev) => {
      const next = { ...prev }
      delete next[visitId]
      return next
    })
    setBusy(false)
  }

  const addVisit = async () => {
    const name = newName.trim()
    if (!name) return
    setBusy(true)
    const nextOrder = visits.length
    const { data } = await supabase
      .from('service_visit_types')
      .insert({ service_type_id: serviceTypeId, name, sort_order: nextOrder })
      .select('*')
      .single()
    if (data) setVisits((prev) => [...prev, data as ServiceVisitType])
    setNewName('')
    setBusy(false)
  }

  const renameVisit = (id: string, name: string) => {
    setVisits((prev) => prev.map((v) => (v.id === id ? { ...v, name } : v)))
  }

  const persistName = async (id: string, name: string) => {
    await supabase
      .from('service_visit_types')
      .update({ name: name.trim(), updated_at: new Date().toISOString() })
      .eq('id', id)
  }

  // Relative revenue weight of a visit type. When a cycle contains differently
  // valued visits (e.g. a heavy Annual vs a light Periodic), the cycle's revenue
  // is apportioned across visits in proportion to these weights.
  const setWeight = (id: string, weight: number) => {
    setVisits((prev) => prev.map((v) => (v.id === id ? { ...v, revenue_weight: weight } : v)))
  }

  const persistWeight = async (id: string, raw: string) => {
    const n = Number.parseFloat(raw)
    const weight = Number.isFinite(n) && n > 0 ? n : 1
    setWeight(id, weight)
    await supabase
      .from('service_visit_types')
      .update({ revenue_weight: weight, updated_at: new Date().toISOString() })
      .eq('id', id)
  }

  // How many times a year a visit of this type happens (e.g. weekly fire alarm
  // = 1 Annual + 51 Periodic). Combined with the weight it apportions revenue.
  const persistOccurrences = async (id: string, raw: string) => {
    const n = Number.parseFloat(raw)
    const occ = Number.isFinite(n) && n >= 0 ? n : 0
    setVisits((prev) =>
      prev.map((v) => (v.id === id ? { ...v, occurrences_per_year: occ } : v)),
    )
    await supabase
      .from('service_visit_types')
      .update({ occurrences_per_year: occ, updated_at: new Date().toISOString() })
      .eq('id', id)
  }

  // Denominator for the revenue split: Σ(occurrences × weight). When occurrences
  // aren't configured (0), fall back to summing weights so the hint still works.
  const totalWeightedOccurrences = visits.reduce(
    (sum, v) => sum + (v.occurrences_per_year ?? 0) * (v.revenue_weight ?? 1),
    0,
  )
  const occurrencesConfigured = totalWeightedOccurrences > 0
  const totalWeight = visits.reduce((sum, v) => sum + (v.revenue_weight ?? 1), 0) || 1
  const totalOccurrences = visits.reduce((sum, v) => sum + (v.occurrences_per_year ?? 0), 0)
  // How many times this service runs per year, from its whole-cycle frequency,
  // so we can hint whether the configured times/year reconcile.
  const cycleMonths = frequencyUnit === 'weeks' ? (frequencyValue * 7) / 30.44 : frequencyValue
  const expectedVisitsPerYear =
    cycleMonths > 0 ? Math.round(12 / cycleMonths) : 0

  const removeVisit = async (id: string) => {
    setBusy(true)
    // Remove the visit's own checklist first so it isn't left orphaned.
    const checklist = checklistsByVisit[id]
    if (checklist) {
      await supabase.from('checklist_templates').delete().eq('id', checklist.id)
      setChecklistsByVisit((prev) => {
        const next = { ...prev }
        delete next[id]
        return next
      })
    }
    await supabase.from('service_visit_types').delete().eq('id', id)
    // Re-pack sort_order so it stays contiguous.
    const remaining = visits.filter((v) => v.id !== id)
    await persistOrder(remaining)
    setVisits(remaining)
    setBusy(false)
  }

  const persistOrder = async (ordered: ServiceVisitType[]) => {
    await Promise.all(
      ordered.map((v, i) =>
        supabase
          .from('service_visit_types')
          .update({ sort_order: i, updated_at: new Date().toISOString() })
          .eq('id', v.id),
      ),
    )
  }

  const move = async (index: number, dir: -1 | 1) => {
    const target = index + dir
    if (target < 0 || target >= visits.length) return
    const reordered = [...visits]
    const [item] = reordered.splice(index, 1)
    reordered.splice(target, 0, item)
    setVisits(reordered)
    setBusy(true)
    await persistOrder(reordered)
    setBusy(false)
  }

  return (
    <div className="grid gap-3 rounded-lg border p-3">
      <div>
        <Label className="text-sm font-medium">Visits per cycle</Label>
        <p className="text-xs text-muted-foreground">
          Add the distinct visits in one service cycle (e.g. Annual, then Periodic), each with its
          own checklist. Visits are spread evenly across the frequency above
          {visits.length > 1
            ? ` — ${describeSpacing(frequencyValue, frequencyUnit, visits.length)}.`
            : '. With one visit (or none) this behaves as a single recurring service.'}
        </p>
        {visits.length > 1 && occurrencesConfigured && (
          <p className="mt-1 text-xs text-muted-foreground">
            Set{' '}
            <span className="font-medium text-foreground">
              {totalOccurrences} visit{totalOccurrences === 1 ? '' : 's'}/year
            </span>{' '}
            across all types
            {expectedVisitsPerYear
              ? ` (this service runs ~${expectedVisitsPerYear}/year).`
              : '.'}{' '}
            Revenue is split by times/year × weight.
          </p>
        )}
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading visits…
        </div>
      ) : (
        <div className="grid gap-2">
          {visits.map((visit, index) => {
            const checklist = checklistsByVisit[visit.id]
            return (
              <div key={visit.id} className="grid gap-2 rounded-lg border bg-muted/30 p-2">
                <div className="flex items-center gap-2">
                  <span className="w-5 shrink-0 text-center text-xs text-muted-foreground">
                    {index + 1}
                  </span>
                  <Input
                    value={visit.name}
                    onChange={(e) => renameVisit(visit.id, e.target.value)}
                    onBlur={(e) => persistName(visit.id, e.target.value)}
                    className="h-9 bg-background"
                  />
                  <div className="flex shrink-0 items-center">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9"
                      disabled={busy || index === 0}
                      onClick={() => move(index, -1)}
                      aria-label="Move visit up"
                    >
                      <ArrowUp className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9"
                      disabled={busy || index === visits.length - 1}
                      onClick={() => move(index, 1)}
                      aria-label="Move visit down"
                    >
                      <ArrowDown className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 text-destructive hover:text-destructive"
                      disabled={busy}
                      onClick={() => removeVisit(visit.id)}
                      aria-label="Delete visit"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {/* Revenue split: how many times a year this visit happens and how
                    much it's worth relative to the others. Only meaningful with 2+
                    visits. Each visit's share = weight / Σ(times/yr × weight). */}
                {visits.length > 1 && (
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-2 pl-7">
                    <div className="flex items-center gap-1.5">
                      <Label
                        htmlFor={`occ-${visit.id}`}
                        className="text-xs text-muted-foreground"
                      >
                        Times / year
                      </Label>
                      <Input
                        id={`occ-${visit.id}`}
                        type="number"
                        min={0}
                        step="1"
                        defaultValue={visit.occurrences_per_year ?? 0}
                        onBlur={(e) => persistOccurrences(visit.id, e.target.value)}
                        className="h-8 w-20 bg-background"
                      />
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Label
                        htmlFor={`weight-${visit.id}`}
                        className="text-xs text-muted-foreground"
                      >
                        Revenue weight
                      </Label>
                      <Input
                        id={`weight-${visit.id}`}
                        type="number"
                        min={0.1}
                        step="0.1"
                        defaultValue={visit.revenue_weight ?? 1}
                        onBlur={(e) => persistWeight(visit.id, e.target.value)}
                        className="h-8 w-20 bg-background"
                      />
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {occurrencesConfigured
                        ? `each visit ≈ ${Math.round(
                            ((visit.revenue_weight ?? 1) / totalWeightedOccurrences) * 100,
                          )}% of annual value`
                        : `≈ ${Math.round(
                            ((visit.revenue_weight ?? 1) / totalWeight) * 100,
                          )}% (set times/year for exact split)`}
                    </span>
                  </div>
                )}

                {/* Per-visit checklist: each visit type owns its own checklist. */}
                <div className="flex items-center gap-2 pl-7">
                  <ClipboardList className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  {checklist ? (
                    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="truncate text-xs font-medium">{checklist.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {checklist.itemCount} item{checklist.itemCount === 1 ? '' : 's'}
                      </span>
                      <Link
                        href={`/dashboard/checklists/${checklist.id}`}
                        target="_blank"
                        className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                      >
                        Edit items
                        <ExternalLink className="h-3 w-3" />
                      </Link>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => removeChecklist(visit.id, checklist.id)}
                        className="text-xs text-muted-foreground hover:text-destructive"
                      >
                        Remove
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-1 items-center gap-2">
                      <span className="text-xs text-muted-foreground">No checklist yet</span>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 bg-transparent text-xs"
                        disabled={busy}
                        onClick={() => createChecklist(visit)}
                      >
                        <Plus className="mr-1 h-3 w-3" />
                        Add checklist
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            )
          })}

          <div className="flex items-center gap-2">
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  addVisit()
                }
              }}
              placeholder="e.g. Annual, Periodic"
              className="h-9"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="shrink-0 bg-transparent"
              disabled={busy || !newName.trim()}
              onClick={addVisit}
            >
              <Plus className="mr-1 h-4 w-4" />
              Add
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
