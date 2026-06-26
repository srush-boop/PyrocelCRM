'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'
import { saveSpecTemplate } from '@/app/(dashboard)/dashboard/sales/quote-config-actions'
import { WORK_TYPES, workTypeLabel } from '@/lib/sales'
import type { SystemType, SystemSpecTemplate } from '@/lib/types/database'

export function SpecTemplatesManager({
  systemTypes,
  templates,
}: {
  systemTypes: SystemType[]
  templates: SystemSpecTemplate[]
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [systemTypeId, setSystemTypeId] = useState<string>(systemTypes[0]?.id ?? '')
  const [workType, setWorkType] = useState<string>(WORK_TYPES[0].code)

  // Map of existing template specs keyed by `${systemTypeId}:${workType}`.
  const templateMap = useMemo(() => {
    const map = new Map<string, SystemSpecTemplate>()
    for (const t of templates) {
      if (t.system_type_id) map.set(`${t.system_type_id}:${t.work_type}`, t)
    }
    return map
  }, [templates])

  const currentKey = `${systemTypeId}:${workType}`
  const existing = templateMap.get(currentKey)
  const [spec, setSpec] = useState<string>(existing?.specification ?? '')
  // Track which key the textarea reflects so switching selectors reloads it.
  const [loadedKey, setLoadedKey] = useState<string>(currentKey)
  if (loadedKey !== currentKey) {
    setLoadedKey(currentKey)
    setSpec(existing?.specification ?? '')
  }

  function handleSave() {
    if (!systemTypeId) {
      toast.error('Select a system type first')
      return
    }
    startTransition(async () => {
      const res = await saveSpecTemplate({
        system_type_id: systemTypeId,
        work_type: workType,
        specification: spec,
      })
      if (res.ok) {
        toast.success('Template saved')
        router.refresh()
      } else {
        toast.error(res.error ?? 'Could not save template')
      }
    })
  }

  if (systemTypes.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          No system types yet. Add a system type (with a code) first.
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
      <Card className="h-fit">
        <CardHeader>
          <CardTitle className="text-base">Select template</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2">
            <Label>System type</Label>
            <Select value={systemTypeId} onValueChange={setSystemTypeId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {systemTypes.map((st) => (
                  <SelectItem key={st.id} value={st.id}>
                    {st.code ? `${st.code} — ${st.name}` : st.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label>Type of work</Label>
            <Select value={workType} onValueChange={setWorkType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {WORK_TYPES.map((w) => (
                  <SelectItem key={w.code} value={w.code}>
                    {w.code} — {w.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="text-xs text-muted-foreground">
            {existing ? (
              <Badge variant="secondary">Template exists</Badge>
            ) : (
              <Badge variant="outline">No template yet</Badge>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Specification — {workTypeLabel(workType)}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            value={spec}
            onChange={(e) => setSpec(e.target.value)}
            rows={18}
            placeholder="Master specification text for this system and type of work..."
          />
          <div className="flex justify-end">
            <Button onClick={handleSave} disabled={isPending}>
              {isPending ? 'Saving...' : 'Save template'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
