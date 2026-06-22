'use client'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { describeTolerance } from '@/lib/kpi'
import type { ToleranceUnit } from '@/lib/types/database'

export interface ToleranceFieldsValue {
  regulatory_tolerance_value: number
  regulatory_tolerance_unit: ToleranceUnit
  client_tolerance_value: number
  client_tolerance_unit: ToleranceUnit
}

interface ToleranceFieldsProps {
  value: ToleranceFieldsValue
  onChange: (next: ToleranceFieldsValue) => void
}

// Shared editor for the two compliance tolerances (regulatory + client) on a
// service type. Used by both the add and edit dialogs.
export function ToleranceFields({ value, onChange }: ToleranceFieldsProps) {
  return (
    <div className="grid gap-3 rounded-lg border border-border p-3">
      <div>
        <h4 className="text-sm font-medium">Compliance tolerance</h4>
        <p className="text-xs text-muted-foreground">
          How far from the due date a service can be completed and still count as compliant.
          Use months for calendar windows (0 = within the due month) or days (0 = the exact
          day).
        </p>
      </div>

      <ToleranceRow
        idPrefix="regulatory"
        label="Regulatory KPI"
        hint="The legal/standards baseline."
        unit={value.regulatory_tolerance_unit}
        numberValue={value.regulatory_tolerance_value}
        onValueChange={(v) => onChange({ ...value, regulatory_tolerance_value: v })}
        onUnitChange={(u) => onChange({ ...value, regulatory_tolerance_unit: u })}
      />

      <ToleranceRow
        idPrefix="client"
        label="Client KPI"
        hint="The (usually tighter) target shared with clients."
        unit={value.client_tolerance_unit}
        numberValue={value.client_tolerance_value}
        onValueChange={(v) => onChange({ ...value, client_tolerance_value: v })}
        onUnitChange={(u) => onChange({ ...value, client_tolerance_unit: u })}
      />
    </div>
  )
}

interface ToleranceRowProps {
  idPrefix: string
  label: string
  hint: string
  unit: ToleranceUnit
  numberValue: number
  onValueChange: (value: number) => void
  onUnitChange: (unit: ToleranceUnit) => void
}

function ToleranceRow({
  idPrefix,
  label,
  hint,
  unit,
  numberValue,
  onValueChange,
  onUnitChange,
}: ToleranceRowProps) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={`${idPrefix}-tolerance-value`}>{label}</Label>
      <div className="grid grid-cols-2 gap-2">
        <Input
          id={`${idPrefix}-tolerance-value`}
          type="number"
          min={0}
          max={60}
          value={numberValue}
          onChange={(e) => onValueChange(Math.max(0, parseInt(e.target.value) || 0))}
        />
        <Select value={unit} onValueChange={(u) => onUnitChange(u as ToleranceUnit)}>
          <SelectTrigger id={`${idPrefix}-tolerance-unit`} aria-label={`${label} unit`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="days">Days</SelectItem>
            <SelectItem value="months">Months</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <p className="text-xs text-muted-foreground">
        {hint}{' '}
        <span className="font-medium text-foreground">
          {describeTolerance({ value: numberValue, unit })}
        </span>
      </p>
    </div>
  )
}
