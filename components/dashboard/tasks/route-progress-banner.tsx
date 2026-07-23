import { Route as RouteIcon } from 'lucide-react'
import type { RouteProgress } from '@/lib/routes/route-progress'

/**
 * Compact "call X of Y" banner shown at the top of a CDO's routed call so they
 * always know where they are in the route's ordered day. Renders nothing when
 * there is no route context (non-CDO calls, reactive calls, etc.).
 */
export function RouteProgressBanner({ progress }: { progress?: RouteProgress | null }) {
  if (!progress) return null
  const { routeName, position, total, nextTaskId } = progress
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/40 px-4 py-2.5">
      <div className="flex items-center gap-2 text-sm">
        <RouteIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="font-medium text-foreground">{routeName}</span>
      </div>
      <div className="flex items-center gap-2 text-sm">
        <span className="font-semibold text-foreground">
          Call {position} of {total}
        </span>
        <span className="text-xs text-muted-foreground">
          {nextTaskId ? `${total - position} to go` : 'Last on route'}
        </span>
      </div>
    </div>
  )
}
