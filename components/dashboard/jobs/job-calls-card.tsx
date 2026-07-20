import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { StatusBadge } from '@/components/ui/status-badge'
import { PhoneCall, ChevronRight, Wrench } from 'lucide-react'
import { formatDateUK } from '@/lib/utils'

export interface JobCallRow {
  id: string
  reference_number: string | null
  title: string | null
  status: string
  scheduled_date: string | null
  is_commissioning: boolean | null
}

interface JobCallsCardProps {
  calls: JobCallRow[]
}

const STATUS_LABEL: Record<string, string> = {
  pending: 'Scheduled',
  in_progress: 'In progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
}

/**
 * Calls (site visits) booked against a job, each linking to the call detail
 * page. Covers install, commissioning and remedial attendance raised from the
 * job.
 */
export function JobCallsCard({ calls }: JobCallsCardProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <PhoneCall className="h-4 w-4 text-muted-foreground" />
          Calls
        </CardTitle>
        {calls.length > 0 ? (
          <span className="text-xs text-muted-foreground">{calls.length} booked</span>
        ) : null}
      </CardHeader>
      <CardContent>
        {calls.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No calls have been booked for this job yet. Use{' '}
            <span className="font-medium text-foreground">Book call</span> above to schedule
            install or commissioning attendance.
          </p>
        ) : (
          <ul className="divide-y rounded-md border">
            {calls.map((call) => (
              <li key={call.id}>
                <Link
                  href={`/dashboard/tasks/${call.id}`}
                  className="flex items-center justify-between gap-3 p-3 transition-colors hover:bg-muted/50"
                >
                  <span className="min-w-0">
                    <span className="flex items-center gap-2">
                      <span className="truncate font-medium text-foreground">
                        {call.reference_number ?? call.title ?? 'Call'}
                      </span>
                      {call.is_commissioning ? (
                        <span className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase text-muted-foreground">
                          <Wrench className="h-2.5 w-2.5" />
                          Commissioning
                        </span>
                      ) : null}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {call.scheduled_date ? formatDateUK(call.scheduled_date) : 'Unscheduled'}
                    </span>
                  </span>
                  <span className="flex items-center gap-3">
                    <StatusBadge
                      label={STATUS_LABEL[call.status] ?? call.status}
                      status={call.status}
                    />
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
