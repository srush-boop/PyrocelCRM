'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  ClipboardList,
  Clock,
  ClipboardCheck,
  PauseCircle,
  Search,
  AlertCircle,
  Flame,
  ArrowRight,
} from 'lucide-react'
import { formatDateUK } from '@/lib/utils'
import type { Task, SiteService, ServiceType, Profile } from '@/lib/types/database'

export type OpenCall = Omit<Task, 'site_service' | 'service_type' | 'assigned_engineer'> & {
  site_service: (SiteService & { service_type: ServiceType | null }) | null
  service_type: Pick<ServiceType, 'id' | 'name'> | null
  assigned_engineer: Profile | null
}

const STATUS_META: Record<
  'pending' | 'in_progress' | 'paused',
  { label: string; icon: typeof Clock; className: string }
> = {
  pending: {
    label: 'Pending',
    icon: Clock,
    className: 'bg-secondary text-secondary-foreground',
  },
  in_progress: {
    label: 'In Progress',
    icon: ClipboardCheck,
    className: 'bg-primary/10 text-primary border-primary/20',
  },
  paused: {
    label: 'Paused',
    icon: PauseCircle,
    className: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
  },
}

function serviceName(call: OpenCall) {
  return (
    call.site_service?.service_type?.name ||
    call.service_type?.name ||
    'Ad-hoc / reactive'
  )
}

export function SiteOpenCalls({ openCalls }: { openCalls: OpenCall[] }) {
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    if (!search.trim()) return openCalls
    const q = search.toLowerCase()
    return openCalls.filter((call) => {
      return (
        serviceName(call).toLowerCase().includes(q) ||
        call.assigned_engineer?.full_name?.toLowerCase().includes(q) ||
        call.notes?.toLowerCase().includes(q)
      )
    })
  }, [openCalls, search])

  if (openCalls.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5" />
            Open Calls
          </CardTitle>
          <CardDescription>Calls that are scheduled, in progress or paused</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="py-8 text-center text-muted-foreground">
            No open calls for this site. Completed calls appear under the Reports tab.
          </p>
        </CardContent>
      </Card>
    )
  }

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <ClipboardList className="h-5 w-5" />
              Open Calls
            </CardTitle>
            <CardDescription>
              {filtered.length} of {openCalls.length} open {openCalls.length === 1 ? 'call' : 'calls'}
            </CardDescription>
          </div>
          <div className="relative w-full max-w-xs">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search calls..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Service</TableHead>
              <TableHead>Scheduled</TableHead>
              <TableHead>Engineer</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center">
                  <div className="flex flex-col items-center gap-2">
                    <AlertCircle className="h-8 w-8 text-muted-foreground/50" />
                    <p className="text-muted-foreground">No open calls match your search</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((call) => {
                const meta = STATUS_META[call.status as 'pending' | 'in_progress' | 'paused'] ?? STATUS_META.pending
                const StatusIcon = meta.icon
                const scheduled = call.scheduled_date ? new Date(call.scheduled_date) : null
                const isOverdue = scheduled ? scheduled < today && call.status === 'pending' : false
                // A call is "started" once work has begun. `started_at` is preserved
                // across a pause, so this covers both actively in-progress and paused
                // (started-then-paused) calls.
                const isStarted = Boolean(call.started_at)
                const isActive = call.status === 'in_progress'
                return (
                  <TableRow
                    key={call.id}
                    className={
                      isStarted
                        ? 'border-l-2 border-l-primary bg-primary/[0.04] hover:bg-primary/[0.07]'
                        : undefined
                    }
                  >
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        {call.is_emergency && <Flame className="h-4 w-4 text-destructive" aria-label="Emergency" />}
                        <span>{serviceName(call)}</span>
                        {call.is_remedial && (
                          <Badge variant="outline" className="text-xs">
                            Remedial
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className={isOverdue ? 'font-medium text-destructive' : ''}>
                        {call.scheduled_date ? formatDateUK(call.scheduled_date) : '-'}
                      </span>
                      {isOverdue && (
                        <span className="ml-2 text-xs font-medium text-destructive">Overdue</span>
                      )}
                      {isStarted && call.started_at && (
                        <span className="mt-0.5 block text-xs text-muted-foreground">
                          Started {formatDateUK(call.started_at)}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>{call.assigned_engineer?.full_name || 'Unassigned'}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={meta.className}>
                        {isActive ? (
                          <span
                            className="mr-1.5 inline-block h-2 w-2 animate-pulse rounded-full bg-primary"
                            aria-hidden
                          />
                        ) : (
                          <StatusIcon className="mr-1 h-3 w-3" />
                        )}
                        {meta.label}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" asChild>
                        <Link href={`/dashboard/tasks/${call.id}`}>
                          View
                          <ArrowRight className="ml-1 h-4 w-4" />
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
