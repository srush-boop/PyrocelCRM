'use client'

import { useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Plus, Trash2, ClipboardList, Cpu } from 'lucide-react'
import type { SystemType } from '@/lib/types/database'

// One checklist entry attached to a non-recurring call type. `system_type_id`
// null = the general/any-system fallback checklist. `id` present = an existing
// checklist_templates row; absent = a new stub to be created on save.
export interface ServiceTypeChecklistEntry {
  id?: string
  system_type_id: string | null
  name: string
  itemCount?: number
}

// Controlled editor for the "Systems & checklists" section of a non-recurring
// call type. Lets the user assign the call type to multiple systems, each with
// its own checklist, plus one optional general fallback — so a single call type
// can be reused across systems instead of recreating it for every system.
export function ServiceTypeChecklistsField({
  systemTypes,
  serviceName,
  entries,
  onChange,
}: {
  systemTypes: SystemType[]
  serviceName: string
  entries: ServiceTypeChecklistEntry[]
  onChange: (entries: ServiceTypeChecklistEntry[]) => void
}) {
  const usedSystemIds = useMemo(
    () => new Set(entries.map((e) => e.system_type_id).filter(Boolean) as string[]),
    [entries],
  )
  const hasGeneral = entries.some((e) => e.system_type_id === null)
  const availableSystems = systemTypes.filter((st) => !usedSystemIds.has(st.id))

  const defaultName = (systemName: string | null) =>
    systemName ? `${serviceName || 'Call'} — ${systemName}` : `${serviceName || 'Call'} — General`

  const addSystem = (systemTypeId: string) => {
    const st = systemTypes.find((s) => s.id === systemTypeId)
    onChange([
      ...entries,
      { system_type_id: systemTypeId, name: defaultName(st?.name ?? null) },
    ])
  }

  const addGeneral = () => {
    onChange([...entries, { system_type_id: null, name: defaultName(null) }])
  }

  const updateName = (index: number, name: string) => {
    onChange(entries.map((e, i) => (i === index ? { ...e, name } : e)))
  }

  const removeEntry = (index: number) => {
    const entry = entries[index]
    // Removing an existing checklist that already has items is destructive.
    if (entry.id && (entry.itemCount ?? 0) > 0) {
      const ok = window.confirm(
        `"${entry.name}" has ${entry.itemCount} checklist item(s). Removing it here will delete the checklist when you save. Continue?`,
      )
      if (!ok) return
    }
    onChange(entries.filter((_, i) => i !== index))
  }

  const systemName = (id: string | null) =>
    id ? systemTypes.find((s) => s.id === id)?.name ?? 'Unknown system' : 'General (any system)'

  return (
    <div className="grid gap-3 rounded-md border border-dashed p-3">
      <div className="space-y-0.5">
        <Label className="flex items-center gap-2">
          <ClipboardList className="h-4 w-4 text-muted-foreground" />
          Systems &amp; checklists
        </Label>
        <p className="text-xs text-muted-foreground text-pretty">
          Assign this call type to one or more systems, each with its own checklist. When a call is
          booked, the checklist for the chosen system is used. Add a General checklist as a fallback
          for systems without a specific one. Checklist items are edited on the Checklists page.
        </p>
      </div>

      {entries.length > 0 && (
        <ul className="grid gap-2">
          {entries.map((entry, index) => (
            <li
              key={entry.id ?? `new-${index}-${entry.system_type_id ?? 'general'}`}
              className="grid gap-2 rounded-md border bg-muted/30 p-2"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 text-sm font-medium">
                  {entry.system_type_id === null ? (
                    <Badge variant="secondary" className="gap-1">
                      <ClipboardList className="h-3 w-3" />
                      General fallback
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="gap-1">
                      <Cpu className="h-3 w-3" />
                      {systemName(entry.system_type_id)}
                    </Badge>
                  )}
                  {entry.id ? (
                    <span className="text-xs text-muted-foreground">
                      {entry.itemCount ?? 0} item{(entry.itemCount ?? 0) === 1 ? '' : 's'}
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">new</span>
                  )}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-destructive"
                  onClick={() => removeEntry(index)}
                  aria-label={`Remove ${systemName(entry.system_type_id)} checklist`}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              <Input
                value={entry.name}
                onChange={(e) => updateName(index, e.target.value)}
                placeholder="Checklist name"
                className="h-8 text-sm"
              />
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Select value="" onValueChange={addSystem}>
          <SelectTrigger className="h-8 w-auto min-w-44 text-xs" disabled={availableSystems.length === 0}>
            <SelectValue placeholder={availableSystems.length ? 'Add a system…' : 'All systems added'} />
          </SelectTrigger>
          <SelectContent>
            {availableSystems.map((st) => (
              <SelectItem key={st.id} value={st.id} className="text-xs">
                {st.code ? `${st.code} — ${st.name}` : st.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {!hasGeneral && (
          <Button type="button" variant="outline" size="sm" className="h-8" onClick={addGeneral}>
            <Plus className="mr-1 h-3.5 w-3.5" />
            General checklist
          </Button>
        )}
      </div>
    </div>
  )
}
