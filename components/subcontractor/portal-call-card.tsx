import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Building2, ChevronRight, Clock, MapPin, Siren, User, Wrench } from 'lucide-react'
import { formatDateUK } from '@/lib/utils'
import type { PortalCall } from '@/lib/subcontractor/portal-data'

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  in_progress: 'In progress',
  paused: 'Paused',
  completed: 'Completed',
  cancelled: 'Cancelled',
}

/** A single call row linking to its portal detail page. Priority-aware. */
export function PortalCallCard({ call }: { call: PortalCall }) {
  return (
    <Link href={`/subcontractor/calls/${call.id}`} className="block">
      <Card
        className={
          call.isEmergency
            ? 'border-l-4 border-l-destructive transition-colors hover:bg-muted/40'
            : call.isRemedial
              ? 'border-l-4 border-l-amber-500 transition-colors hover:bg-muted/40'
              : 'transition-colors hover:border-primary/50 hover:bg-muted/40'
        }
      >
        <CardContent className="flex items-center gap-4 py-4">
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span className="font-medium text-foreground">{call.siteName || 'Site'}</span>
              {call.isEmergency && (
                <Badge variant="destructive" className="gap-1">
                  <Siren className="h-3 w-3" aria-hidden="true" />
                  Emergency
                </Badge>
              )}
              {call.isRemedial && (
                <Badge variant="secondary" className="gap-1">
                  <Wrench className="h-3 w-3" aria-hidden="true" />
                  Remedial
                </Badge>
              )}
              {call.systemTypeName && (
                <Badge variant="outline" className="text-xs font-normal">
                  {call.systemTypeName}
                </Badge>
              )}
            </div>
            <p className="truncate text-sm text-muted-foreground">
              {call.serviceName || 'Service'}
              {call.clientName ? ` · ${call.clientName}` : ''}
            </p>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              {call.sitePostcode && (
                <span className="flex items-center gap-1">
                  <MapPin className="h-3 w-3" aria-hidden="true" />
                  {call.sitePostcode}
                </span>
              )}
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" aria-hidden="true" />
                {call.scheduledDate ? formatDateUK(call.scheduledDate) : 'Unscheduled'}
              </span>
              <span className="flex items-center gap-1">
                <User className="h-3 w-3" aria-hidden="true" />
                {call.assignedEngineerName ? call.assignedEngineerName : 'Unassigned'}
              </span>
            </div>
          </div>
          <Badge variant="secondary" className="shrink-0">
            {STATUS_LABELS[call.status] ?? call.status}
          </Badge>
          <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
        </CardContent>
      </Card>
    </Link>
  )
}
