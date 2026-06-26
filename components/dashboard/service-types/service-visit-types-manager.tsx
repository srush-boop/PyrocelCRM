'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ArrowDown, ArrowUp, Loader2, Plus, Trash2 } from 'lucide-react'
import type { ServiceVisitType } from '@/lib/types/database'

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
  const [loading, setLoading] = useState(true)
  const [newName, setNewName] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('service_visit_types')
      .select('*')
      .eq('service_type_id', serviceTypeId)
      .order('sort_order', { ascending: true })
    setVisits((data || []) as ServiceVisitType[])
    setLoading(false)
  }, [supabase, serviceTypeId])

  useEffect(() => {
    load()
  }, [load])

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

  const removeVisit = async (id: string) => {
    setBusy(true)
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
          Add the distinct visits in one service cycle (e.g. Annual, then Periodic). Visits are
          spread evenly across the frequency above
          {visits.length > 1
            ? ` — ${describeSpacing(frequencyValue, frequencyUnit, visits.length)}.`
            : '. With one visit (or none) this behaves as a single recurring service.'}
        </p>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading visits…
        </div>
      ) : (
        <div className="grid gap-2">
          {visits.map((visit, index) => (
            <div key={visit.id} className="flex items-center gap-2">
              <span className="w-5 shrink-0 text-center text-xs text-muted-foreground">
                {index + 1}
              </span>
              <Input
                value={visit.name}
                onChange={(e) => renameVisit(visit.id, e.target.value)}
                onBlur={(e) => persistName(visit.id, e.target.value)}
                className="h-9"
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
          ))}

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
