'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import {
  saveSystemWorkTypeMargin,
  saveWorkTypeSetting,
} from '@/app/(dashboard)/dashboard/sales/quote-config-actions'
import { WORK_TYPES } from '@/lib/sales'
import type { SystemType, SystemWorkTypeMargin, WorkTypeSetting } from '@/lib/types/database'

export function SystemMarginsManager({
  systemTypes,
  margins,
  settings,
}: {
  systemTypes: SystemType[]
  margins: SystemWorkTypeMargin[]
  settings: WorkTypeSetting[]
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  // Local editable copies keyed for quick lookup.
  const marginKey = (systemTypeId: string, workType: string) => `${systemTypeId}::${workType}`
  const [marginValues, setMarginValues] = useState<Record<string, string>>(() => {
    const map: Record<string, string> = {}
    for (const m of margins) {
      map[marginKey(m.system_type_id, m.work_type)] = String(m.margin_percent)
    }
    return map
  })

  const designByWorkType = useMemo(() => {
    const map: Record<string, boolean> = {}
    for (const s of settings) map[s.work_type] = s.requires_design
    return map
  }, [settings])
  const [design, setDesign] = useState<Record<string, boolean>>(designByWorkType)

  function commitMargin(systemTypeId: string, workType: string, raw: string) {
    const trimmed = raw.trim()
    const parsed = trimmed === '' ? null : Number(trimmed)
    if (parsed !== null && (!Number.isFinite(parsed) || parsed < 0 || parsed >= 100)) {
      toast.error('Margin must be between 0 and 99.9%')
      return
    }
    startTransition(async () => {
      const res = await saveSystemWorkTypeMargin({
        system_type_id: systemTypeId,
        work_type: workType,
        margin_percent: parsed,
      })
      if (res.ok) {
        router.refresh()
      } else {
        toast.error(res.error ?? 'Could not save margin')
      }
    })
  }

  function toggleDesign(workType: string, value: boolean) {
    setDesign((prev) => ({ ...prev, [workType]: value }))
    startTransition(async () => {
      const res = await saveWorkTypeSetting({ work_type: workType, requires_design: value })
      if (res.ok) {
        toast.success('Saved')
        router.refresh()
      } else {
        setDesign((prev) => ({ ...prev, [workType]: !value }))
        toast.error(res.error ?? 'Could not save setting')
      }
    })
  }

  return (
    <div className="space-y-8">
      {/* Set margins per system type x work type */}
      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Set margins</h2>
          <p className="text-sm text-muted-foreground">
            Gross margin % applied when a system of this type and work type is added. Leave blank to
            fall back to the quote default. Parts added to the system inherit this margin.
          </p>
        </div>
        {systemTypes.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              No active system types. Add system types first.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {systemTypes.map((st) => (
              <Card key={st.id}>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">{st.name}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {WORK_TYPES.map((w) => {
                      const key = marginKey(st.id, w.code)
                      return (
                        <div key={w.code} className="flex items-center justify-between gap-3 rounded-md border p-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="font-mono text-[10px]">
                                {w.code}
                              </Badge>
                            </div>
                            <div className="truncate text-sm">{w.label}</div>
                          </div>
                          <div className="flex shrink-0 items-center gap-1">
                            <Input
                              type="number"
                              inputMode="decimal"
                              min={0}
                              max={99.9}
                              step="0.1"
                              className="h-8 w-20 text-right"
                              value={marginValues[key] ?? ''}
                              placeholder="—"
                              disabled={isPending}
                              onChange={(e) =>
                                setMarginValues((prev) => ({ ...prev, [key]: e.target.value }))
                              }
                              onBlur={(e) => commitMargin(st.id, w.code, e.target.value)}
                            />
                            <span className="text-sm text-muted-foreground">%</span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* Design & survey applicability per work type */}
      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Design &amp; survey</h2>
          <p className="text-sm text-muted-foreground">
            Choose which types of work include the design &amp; survey section on a quote system.
          </p>
        </div>
        <Card>
          <CardContent className="grid gap-2 py-4 sm:grid-cols-2">
            {WORK_TYPES.map((w) => (
              <div
                key={w.code}
                className="flex items-center justify-between gap-4 rounded-md border p-3"
              >
                <Label htmlFor={`design-${w.code}`} className="flex items-center gap-2">
                  <Badge variant="outline" className="font-mono text-[10px]">
                    {w.code}
                  </Badge>
                  {w.label}
                </Label>
                <Switch
                  id={`design-${w.code}`}
                  checked={design[w.code] ?? false}
                  disabled={isPending}
                  onCheckedChange={(v) => toggleDesign(w.code, v)}
                />
              </div>
            ))}
          </CardContent>
        </Card>
      </section>
    </div>
  )
}
