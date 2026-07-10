import Link from 'next/link'
import { Inbox, ChevronRight } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/server'
import type { RequestEntityType } from '@/lib/actions/inbound-requests'
import type { InboundRequestUrgency, InboundRequestStatus } from '@/lib/types/database'

const ENTITY_COLUMN: Record<RequestEntityType, string> = {
  quote: 'related_quote_id',
  job: 'related_job_id',
  site: 'related_site_id',
  task: 'related_task_id',
  defect: 'related_defect_id',
}

const URGENCY_META: Record<InboundRequestUrgency, { label: string; className: string }> = {
  emergency: { label: 'Emergency', className: 'bg-destructive/10 text-destructive border-destructive/30' },
  high: { label: 'High', className: 'bg-amber-500/10 text-amber-700 border-amber-500/30 dark:text-amber-400' },
  normal: { label: 'Normal', className: 'bg-muted text-muted-foreground' },
  low: { label: 'Low', className: 'bg-muted text-muted-foreground' },
}

const STATUS_META: Record<InboundRequestStatus, { label: string; className: string }> = {
  new: { label: 'New', className: 'bg-muted text-muted-foreground' },
  triaged: { label: 'To review', className: 'bg-primary/10 text-primary border-primary/30' },
  actioned: { label: 'Actioned', className: 'bg-emerald-500/10 text-emerald-700 border-emerald-500/30 dark:text-emerald-400' },
  dismissed: { label: 'Dismissed', className: 'bg-muted text-muted-foreground' },
}

interface LinkedRequest {
  id: string
  subject: string | null
  from_name: string | null
  from_email: string | null
  ai_summary: string | null
  ai_urgency: InboundRequestUrgency | null
  status: InboundRequestStatus
  created_at: string
}

/**
 * Compact list of client requests hard-linked to a given entity (quote, job,
 * site, call or defect). Renders nothing when there are none, so it's safe to drop
 * onto any entity page. Each row deep-links into the central Requests inbox.
 */
export async function EntityRequestsCard({
  entityType,
  entityId,
  className,
}: {
  entityType: RequestEntityType
  entityId: string
  className?: string
}) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('inbound_requests')
    .select('id, subject, from_name, from_email, ai_summary, ai_urgency, status, created_at')
    .eq(ENTITY_COLUMN[entityType], entityId)
    .order('created_at', { ascending: false })

  // RLS hides these from non-staff, and there may simply be none — either way,
  // render nothing so the card never shows empty.
  if (error || !data || data.length === 0) return null

  const requests = data as LinkedRequest[]

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Inbox className="h-4 w-4 text-muted-foreground" />
          Linked requests
          <Badge variant="secondary" className="ml-1">
            {requests.length}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-2">
        {requests.map((r) => {
          const urgency = r.ai_urgency ? URGENCY_META[r.ai_urgency] : null
          const status = STATUS_META[r.status]
          const sender = r.from_name || r.from_email || 'Unknown sender'
          return (
            <Link
              key={r.id}
              href={`/dashboard/requests?request=${r.id}`}
              className="group flex items-start gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/50"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate text-sm font-medium">
                    {r.subject || '(no subject)'}
                  </span>
                  {urgency && (
                    <Badge variant="outline" className={cn('text-xs', urgency.className)}>
                      {urgency.label}
                    </Badge>
                  )}
                  <Badge variant="outline" className={cn('text-xs', status.className)}>
                    {status.label}
                  </Badge>
                </div>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  {r.ai_summary || `From ${sender}`}
                </p>
              </div>
              <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
            </Link>
          )
        })}
      </CardContent>
    </Card>
  )
}
