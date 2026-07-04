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
        const isRemedial = key === 'remedial_required'

        if (variant === 'full') {
          return (
            <span
              key={key}
              className={cn(
                'inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium',
                isRemedial
                  ? 'border-destructive/30 bg-destructive/10 text-destructive'
                  : 'border-border bg-muted text-foreground',
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
                  isRemedial
                    ? 'border-destructive/30 bg-destructive/10 text-destructive'
                    : 'border-border bg-muted text-muted-foreground',
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
