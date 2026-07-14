'use client'

import { Siren, UserCheck } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Emergency-CALL counters for the Calls Map header (distinct from the lone-worker
 * safety counters that sit beside them). Shows how many emergency calls are
 * currently being attended to (assigned to an engineer) and how many still need
 * assigning. "To assign" turns red and pulses while any remain, since an
 * unassigned emergency is the most urgent state. Each pill can optionally filter
 * the emergency list by assigned status.
 */
export function EmergencyCallsHeaderCounters({
  assigned,
  toAssign,
  onSelect,
}: {
  assigned: number
  toAssign: number
  onSelect?: (filter: 'assigned' | 'unassigned') => void
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        Emergency calls
      </span>
      <div className="flex items-center gap-2">
        <Counter
          icon={UserCheck}
          label="Assigned"
          value={assigned}
          tone={assigned > 0 ? 'active' : 'neutral'}
          onClick={onSelect ? () => onSelect('assigned') : undefined}
        />
        <Counter
          icon={Siren}
          label="To assign"
          value={toAssign}
          tone={toAssign > 0 ? 'red' : 'neutral'}
          pulse={toAssign > 0}
          onClick={onSelect ? () => onSelect('unassigned') : undefined}
        />
      </div>
    </div>
  )
}

function Counter({
  icon: Icon,
  label,
  value,
  tone,
  pulse,
  onClick,
}: {
  icon: typeof Siren
  label: string
  value: number
  tone: 'neutral' | 'active' | 'red'
  pulse?: boolean
  onClick?: () => void
}) {
  const toneClasses =
    tone === 'red'
      ? 'border-destructive/60 bg-destructive/10 text-destructive'
      : tone === 'active'
        ? 'border-primary/50 bg-primary/10 text-primary'
        : 'border-border bg-muted/40 text-muted-foreground'
  const content = (
    <>
      <Icon className="h-4 w-4" />
      <span className="text-lg font-bold tabular-nums leading-none">{value}</span>
      <span className="hidden text-xs font-medium sm:inline">{label}</span>
    </>
  )
  const classes = cn(
    'flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 transition-colors',
    toneClasses,
    pulse && 'animate-pulse',
  )

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label={`${value} emergency call${value === 1 ? '' : 's'} ${label.toLowerCase()}. Filter the list.`}
        className={cn(
          classes,
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring hover:brightness-95',
        )}
      >
        {content}
      </button>
    )
  }
  return <span className={classes}>{content}</span>
}
