'use client'

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { NominalCode } from '@/lib/types/database'
import { cn } from '@/lib/utils'

const NONE = '__none__'

interface NominalCodeSelectProps {
  /** Currently selected nominal code id, or null/'' for none. */
  value: string | null
  onChange: (id: string | null) => void
  codes: NominalCode[]
  id?: string
  disabled?: boolean
  /** Placeholder shown when nothing is selected. */
  placeholder?: string
  /** Label for the "no code" option (e.g. "None" or "Auto / inherit"). */
  noneLabel?: string
  /** Extra classes applied to the trigger. */
  className?: string
}

/**
 * Shared picker for the managed nominal-code list. Renders active codes plus,
 * if the current value points at an inactive/removed code, that code too so the
 * existing selection is never silently dropped.
 */
export function NominalCodeSelect({
  value,
  onChange,
  codes,
  id,
  disabled,
  placeholder = 'Select a nominal code',
  noneLabel = 'None',
  className,
}: NominalCodeSelectProps) {
  const active = codes.filter((c) => c.active)
  // Ensure the current selection is always present even if inactive.
  const selected = value ? codes.find((c) => c.id === value) : null
  const list =
    selected && !selected.active ? [...active, selected] : active

  return (
    <Select
      value={value || NONE}
      onValueChange={(v) => onChange(v === NONE ? null : v)}
      disabled={disabled}
    >
      <SelectTrigger id={id} className={cn(className)}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>{noneLabel}</SelectItem>
        {list.map((c) => (
          <SelectItem key={c.id} value={c.id}>
            <span className="font-mono">{c.code}</span>
            {' — '}
            {c.name}
            {!c.active ? ' (inactive)' : ''}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
