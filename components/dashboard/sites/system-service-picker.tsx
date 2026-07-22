'use client'

import { useMemo } from 'react'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { ChevronDown, ChevronRight } from 'lucide-react'
import type { ServiceType, SystemType } from '@/lib/types/database'

/** Map of selected system type id -> chosen service type ids for that system. */
export type SystemServiceSelection = Record<string, string[]>

/** Map of service type id -> entered charge value (pounds, as a string). */
export type ServiceValueMap = Record<string, string>

interface SystemServicePickerProps {
  systemTypes: Pick<SystemType, 'id' | 'name' | 'requires_recurring_visits'>[]
  serviceTypes: Pick<ServiceType, 'id' | 'name' | 'system_type_id'>[]
  value: SystemServiceSelection
  onChange: (next: SystemServiceSelection) => void
  /** System type ids that cannot be unticked (e.g. auto-managed by a toggle). */
  lockedSystemTypeIds?: string[]
  /** When set, shows a per-service charge value (£) input beside ticked services. */
  serviceValues?: ServiceValueMap
  onServiceValueChange?: (serviceTypeId: string, value: string) => void
}

/**
 * Inline expandable checklist: tick a system type to attach it to the site, then
 * tick the service types required for it. No services are pre-selected. Used
 * during site setup to provision systems + services in one go.
 */
export function SystemServicePicker({
  systemTypes,
  serviceTypes,
  value,
  onChange,
  lockedSystemTypeIds = [],
  serviceValues,
  onServiceValueChange,
}: SystemServicePickerProps) {
  const showValues = !!serviceValues && !!onServiceValueChange
  const servicesBySystem = useMemo(() => {
    const map = new Map<string, Pick<ServiceType, 'id' | 'name' | 'system_type_id'>[]>()
    for (const st of serviceTypes) {
      if (!st.system_type_id) continue
      const list = map.get(st.system_type_id) ?? []
      list.push(st)
      map.set(st.system_type_id, list)
    }
    for (const list of map.values()) list.sort((a, b) => a.name.localeCompare(b.name))
    return map
  }, [serviceTypes])

  const sortedSystems = useMemo(
    () => [...systemTypes].sort((a, b) => a.name.localeCompare(b.name)),
    [systemTypes],
  )

  function toggleSystem(systemTypeId: string, checked: boolean) {
    const next = { ...value }
    if (checked) {
      next[systemTypeId] = next[systemTypeId] ?? []
    } else {
      delete next[systemTypeId]
    }
    onChange(next)
  }

  function toggleService(systemTypeId: string, serviceTypeId: string, checked: boolean) {
    const current = value[systemTypeId] ?? []
    const nextServices = checked
      ? [...current, serviceTypeId]
      : current.filter((id) => id !== serviceTypeId)
    onChange({ ...value, [systemTypeId]: nextServices })
  }

  if (sortedSystems.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        No system types configured. Add them in Settings first.
      </p>
    )
  }

  return (
    <div className="grid gap-1.5">
      {sortedSystems.map((system) => {
        const isSelected = system.id in value
        const isLocked = lockedSystemTypeIds.includes(system.id)
        const services = servicesBySystem.get(system.id) ?? []
        const chosen = value[system.id] ?? []
        return (
          <div key={system.id} className="rounded-md border">
            <label
              className={`flex items-center gap-2 px-3 py-2 ${
                isLocked ? 'cursor-default' : 'cursor-pointer'
              }`}
            >
              <Checkbox
                checked={isSelected}
                disabled={isLocked}
                onCheckedChange={(c) => toggleSystem(system.id, c === true)}
              />
              {isSelected ? (
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
              )}
              <span className="text-sm font-medium">{system.name}</span>
              {system.requires_recurring_visits === false && (
                <span className="rounded-full border border-zinc-500/25 bg-zinc-500/12 px-1.5 py-0.5 text-[10px] font-normal text-zinc-600 dark:text-zinc-300">
                  Charge-only
                </span>
              )}
              {isLocked && (
                <span className="ml-auto text-xs text-muted-foreground">Auto-added</span>
              )}
              {isSelected && !isLocked && chosen.length > 0 && (
                <span className="ml-auto text-xs text-muted-foreground">
                  {chosen.length} service{chosen.length === 1 ? '' : 's'}
                </span>
              )}
            </label>
            {isSelected && (
              <div className="border-t px-3 py-2 pl-9">
                {services.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    No service types for this system.
                  </p>
                ) : (
                  <div className="grid gap-1.5">
                    <p className="text-xs text-muted-foreground">Services required:</p>
                    {services.map((svc) => {
                      const ticked = chosen.includes(svc.id)
                      return (
                        <div key={svc.id} className="flex items-center gap-2">
                          <label className="flex flex-1 cursor-pointer items-center gap-2">
                            <Checkbox
                              checked={ticked}
                              onCheckedChange={(c) => toggleService(system.id, svc.id, c === true)}
                            />
                            <span className="text-sm">{svc.name}</span>
                          </label>
                          {showValues && ticked && (
                            <div className="flex items-center gap-1">
                              <span className="text-xs text-muted-foreground">£</span>
                              <Input
                                type="number"
                                min={0}
                                step={0.01}
                                inputMode="decimal"
                                aria-label={`Charge value for ${svc.name}`}
                                placeholder="0.00"
                                className="h-7 w-24 text-sm"
                                value={serviceValues?.[svc.id] ?? ''}
                                onChange={(e) => onServiceValueChange?.(svc.id, e.target.value)}
                              />
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
