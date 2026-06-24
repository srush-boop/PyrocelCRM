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

  // Configurable optional sections per work type.
  type SectionFlag = 'requires_questions' | 'requires_design' | 'requires_ppm'
  const SECTION_DEFS: { flag: SectionFlag; label: string; help: string }[] = [
    { flag: 'requires_questions', label: 'Questions', help: 'Conditional question fields' },
    { flag: 'requires_design', label: 'Design & survey', help: 'Design category, survey details' },
    { flag: 'requires_ppm', label: 'PPM', help: 'Planned maintenance pricing' },
  ]
  const sectionsByWorkType = useMemo(() => {
    const map: Record<string, Record<SectionFlag, boolean>> = {}
    for (const w of WORK_TYPES) {
      const s = settings.find((x) => x.work_type === w.code)
      map[w.code] = {
        requires_questions: s?.requires_questions ?? true,
        requires_design: s?.requires_design ?? false,
        requires_ppm: s?.requires_ppm ?? false,
      }
    }
    return map
  }, [settings])
  const [sections, setSections] =
    useState<Record<string, Record<SectionFlag, boolean>>>(sectionsByWorkType)

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

  function toggleSection(workType: string, flag: SectionFlag, value: boolean) {
    setSections((prev) => ({
      ...prev,
      [workType]: { ...prev[workType], [flag]: value },
    }))
    startTransition(async () => {
      const res = await saveWorkTypeSetting({ work_type: workType, [flag]: value })
      if (res.ok) {
        toast.success('Saved')
        router.refresh()
      } else {
        setSections((prev) => ({
          ...prev,
          [workType]: { ...prev[workType], [flag]: !value },
        }))
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

      {/* Configurable quote sections per work type */}
      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Quote sections</h2>
          <p className="text-sm text-muted-foreground">
            Choose which optional sections appear on a quote system for each type of work.
          </p>
        </div>
        <div className="grid gap-4">
          {WORK_TYPES.map((w) => (
            <Card key={w.code}>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Badge variant="outline" className="font-mono text-[10px]">
                    {w.code}
                  </Badge>
                  {w.label}
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-2 sm:grid-cols-3">
                {SECTION_DEFS.map((sec) => (
                  <div
                    key={sec.flag}
                    className="flex items-center justify-between gap-3 rounded-md border p-3"
                  >
                    <Label
                      htmlFor={`${sec.flag}-${w.code}`}
                      className="flex min-w-0 flex-col gap-0.5"
                    >
                      <span className="text-sm">{sec.label}</span>
                      <span className="text-xs text-muted-foreground">{sec.help}</span>
                    </Label>
                    <Switch
                      id={`${sec.flag}-${w.code}`}
                      checked={sections[w.code]?.[sec.flag] ?? false}
                      disabled={isPending}
                      onCheckedChange={(v) => toggleSection(w.code, sec.flag, v)}
                    />
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
    </div>
  )
}
