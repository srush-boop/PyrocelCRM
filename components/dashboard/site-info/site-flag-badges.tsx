import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { SITE_FLAG_META, activeFlagKeys, type SiteFlagKey } from '@/lib/site-flags'
import type { ResolvedSiteFlags } from '@/lib/types/database'

interface SiteFlagBadgesProps {
  flags: ResolvedSiteFlags
  /** Compact = small icon chips (schedule rows). Full = icon + label pills. */
  variant?: 'compact' | 'full'
  className?: string
}

// A distinct tint per flag so engineers can recognise each pre-attendance
// requirement at a glance in the calls list. Remedial keeps the destructive red
// (handled separately) as it's an alert, not just an informational flag.
const FLAG_COLORS: Record<SiteFlagKey, string> = {
  booking_required: 'border-blue-500/30 bg-blue-500/10 text-blue-600',
  access_required: 'border-amber-500/30 bg-amber-500/10 text-amber-600',
  keys_required: 'border-teal-500/30 bg-teal-500/10 text-teal-600',
  two_engineers_required: 'border-indigo-500/30 bg-indigo-500/10 text-indigo-600',
  remedial_required: 'border-destructive/30 bg-destructive/10 text-destructive',
}

/**
 * Renders the active pre-attendance flags as icons. In compact mode (used on
 * schedule task lines) each flag is a small icon with a tooltip; remedial uses
 * an attention colour so it stands out.
 */
export function SiteFlagBadges({ flags, variant = 'compact', className }: SiteFlagBadgesProps) {
  const active = activeFlagKeys(flags)
  if (active.length === 0) return null

  return (
    <div className={cn('flex flex-wrap items-center gap-1', className)}>
      {active.map((key: SiteFlagKey) => {
        const meta = SITE_FLAG_META[key]
        const Icon = meta.icon
        const colorClass = FLAG_COLORS[key]

        if (variant === 'full') {
          return (
            <span
              key={key}
              className={cn(
                'inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium',
                colorClass,
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {meta.short}
            </span>
          )
        }

        return (
          <Tooltip key={key}>
            <TooltipTrigger asChild>
              <span
                className={cn(
                  'inline-flex h-6 w-6 items-center justify-center rounded-md border',
                  colorClass,
                )}
                aria-label={meta.label}
              >
                <Icon className="h-3.5 w-3.5" />
              </span>
            </TooltipTrigger>
            <TooltipContent>{meta.label}</TooltipContent>
          </Tooltip>
        )
      })}
    </div>
  )
}
