'use client'

import { Check, X, Undo2, Package } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { DefectSuggestedPart } from '@/lib/defects/suggested-parts'

export type SuggestedPartDecision = 'confirmed' | 'removed'

/**
 * Confirm-or-remove list for the parts an engineer suggested on a defect.
 * Controlled: the parent owns the decisions and decides what "confirm" does
 * (add a quote line, or carry the part onto a remedial call).
 */
export function SuggestedPartsReview({
  parts,
  decisions,
  onDecide,
  disabled,
}: {
  parts: DefectSuggestedPart[]
  decisions: Record<string, SuggestedPartDecision | undefined>
  onDecide: (part: DefectSuggestedPart, decision: SuggestedPartDecision | null) => void
  disabled?: boolean
}) {
  if (parts.length === 0) return null

  return (
    <ul className="flex flex-col divide-y rounded-md border">
      {parts.map((p) => {
        const decision = decisions[p.partId]
        return (
          <li
            key={p.partId}
            className={cn(
              'flex flex-wrap items-center gap-3 px-3 py-2',
              decision === 'removed' && 'bg-muted/40',
            )}
          >
            <Package className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p
                className={cn(
                  'truncate text-sm font-medium',
                  decision === 'removed' && 'text-muted-foreground line-through',
                )}
              >
                {p.name}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {[p.sku, `Qty ${p.quantity}${p.unit ? ` ${p.unit}` : ''}`].filter(Boolean).join(' · ')}
              </p>
            </div>
            {decision ? (
              <div className="flex items-center gap-2">
                <Badge variant={decision === 'confirmed' ? 'default' : 'outline'}>
                  {decision === 'confirmed' ? 'Confirmed' : 'Removed'}
                </Badge>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={disabled}
                  onClick={() => onDecide(p, null)}
                >
                  <Undo2 className="mr-1 h-3.5 w-3.5" />
                  Undo
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={disabled}
                  onClick={() => onDecide(p, 'removed')}
                >
                  <X className="mr-1 h-3.5 w-3.5" />
                  Remove
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={disabled}
                  onClick={() => onDecide(p, 'confirmed')}
                >
                  <Check className="mr-1 h-3.5 w-3.5" />
                  Confirm
                </Button>
              </div>
            )}
          </li>
        )
      })}
    </ul>
  )
}
