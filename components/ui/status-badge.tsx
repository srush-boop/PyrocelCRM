import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import {
  STATUS_TONE_CLASS,
  STATUS_TONE_SOLID,
  statusTone,
  type StatusTone,
} from '@/lib/status-colors'

interface StatusBadgeProps {
  /** Text shown inside the badge. */
  label: string
  /**
   * Explicit semantic tone. If omitted, the tone is inferred from `label` (or
   * `status`) via the shared keyword resolver.
   */
  tone?: StatusTone
  /** Raw status string used for tone inference when `tone` is not supplied. */
  status?: string | null
  /** Solid filled style instead of the default soft tint. */
  solid?: boolean
  className?: string
}

/**
 * Consistent, colour-coded status pill used across all grids. Pass an explicit
 * `tone` for known statuses, or let it infer one from the label/status text.
 */
export function StatusBadge({
  label,
  tone,
  status,
  solid = false,
  className,
}: StatusBadgeProps) {
  const resolved = tone ?? statusTone(status ?? label)
  return (
    <Badge
      variant="outline"
      className={cn(
        'font-medium',
        solid ? STATUS_TONE_SOLID[resolved] : STATUS_TONE_CLASS[resolved],
        className,
      )}
    >
      {label}
    </Badge>
  )
}
