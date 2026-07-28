'use client'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { ShieldCheck } from 'lucide-react'
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
  // Whether this service type is subject to regulatory compliance. When false,
  // it's kept in the client KPI tier but omitted from regulatory figures.
  regulatory_compliance: boolean
}

interface ToleranceFieldsProps {
  value: ToleranceFieldsValue
  onChange: (next: ToleranceFieldsValue) => void
}

// Editor for the regulatory KPI on a service type. This is the legal/standards
// baseline and the default the client tier inherits. Tighter client KPIs are
// set per site/service in the site's service setup, not here.
export function ToleranceFields({ value, onChange }: ToleranceFieldsProps) {
  const subjectToRegulatory = value.regulatory_compliance !== false
  return (
    <div className="grid gap-3 rounded-lg border border-border p-3">
      <div>
        <h4 className="text-sm font-medium">Regulatory KPI (default)</h4>
        <p className="text-xs text-muted-foreground">
          How far from the due date a service can be completed and still count as compliant.
          Use months for calendar windows (0 = within the due month) or days (0 = the exact
          day). Clients inherit this standard unless a tighter client KPI is set per site.
        </p>
      </div>

      <div className="flex items-start justify-between gap-3 rounded-md border border-dashed p-3">
        <div className="space-y-0.5">
          <Label htmlFor="regulatory-compliance" className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-primary" />
            Subject to regulatory compliance
          </Label>
          <p className="text-xs text-muted-foreground text-pretty">
            {subjectToRegulatory
              ? 'Included in the Regulatory KPI tier and the compliance-by-service chart.'
              : 'Not a regulated service — kept in the Client KPI tier but omitted from regulatory figures.'}
          </p>
        </div>
        <Switch
          id="regulatory-compliance"
          checked={subjectToRegulatory}
          onCheckedChange={(v) => onChange({ ...value, regulatory_compliance: v })}
        />
      </div>

      {subjectToRegulatory && (
        <ToleranceRow
          idPrefix="regulatory"
          label="Regulatory KPI"
          hint="The legal/standards baseline."
          unit={value.regulatory_tolerance_unit}
          numberValue={value.regulatory_tolerance_value}
          onValueChange={(v) => onChange({ ...value, regulatory_tolerance_value: v })}
          onUnitChange={(u) => onChange({ ...value, regulatory_tolerance_unit: u })}
        />
      )}
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
