'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { ScrollText, Search, ChevronDown, X } from 'lucide-react'

export interface AuditLogEntry {
  id: string
  created_at: string
  actor_id: string | null
  actor_email: string | null
  actor_role: string | null
  action: string
  entity_type: string | null
  entity_id: string | null
  target_label: string | null
  metadata: Record<string, unknown>
  ip_address: string | null
  user_agent: string | null
}

export interface AuditActor {
  id: string
  email: string
  role: string | null
}

// Higher-risk actions get a destructive/amber tone so they stand out in the log.
const ACTION_TONE: Record<string, 'destructive' | 'default' | 'secondary'> = {
  'user.delete': 'destructive',
  'user.role_change': 'destructive',
  'client_user.delete': 'destructive',
  'call.cancel': 'destructive',
  'invoice.void': 'destructive',
  'user.status_change': 'default',
  'user.permission_change': 'default',
  'user.password_reset': 'default',
  'call.reassign': 'default',
  'quote.status_change': 'default',
  'invoice.issue': 'default',
}

function humanize(value: string) {
  return value.replace(/[._]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function formatWhen(iso: string) {
  const d = new Date(iso)
  return d.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function AuditLogView({
  logs,
  actions,
  entities,
  actors,
  pageSize,
  activeAction,
  activeEntity,
  activeActor,
  fromDate,
  toDate,
  query,
}: {
  logs: AuditLogEntry[]
  actions: string[]
  entities: string[]
  actors: AuditActor[]
  pageSize: number
  activeAction: string
  activeEntity: string
  activeActor: string
  fromDate: string
  toDate: string
  query: string
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()
  const [term, setTerm] = useState(query)

  const pushParams = (next: Record<string, string | undefined>) => {
    const params = new URLSearchParams(searchParams.toString())
    for (const [key, value] of Object.entries(next)) {
      if (value === undefined) continue
      // 'all' and empty string both mean "no filter" → drop the param.
      if (!value || value === 'all') params.delete(key)
      else params.set(key, value)
    }
    startTransition(() => router.push(`/dashboard/audit-log?${params.toString()}`))
  }

  const onSearch = (e: React.FormEvent) => {
    e.preventDefault()
    pushParams({ q: term })
  }

  const clearAll = () => {
    setTerm('')
    startTransition(() => router.push('/dashboard/audit-log'))
  }

  const hasFilters =
    activeAction !== 'all' ||
    activeEntity !== 'all' ||
    activeActor !== 'all' ||
    Boolean(fromDate) ||
    Boolean(toDate) ||
    Boolean(query)

  const rows = useMemo(() => logs, [logs])

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <header className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
          <ScrollText className="h-5 w-5 text-muted-foreground" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-balance">Activity Log</h1>
          <p className="text-sm text-muted-foreground">
            Who changed what, where and when — account, permission and operational events.
          </p>
        </div>
      </header>

      <Card>
        <CardHeader className="gap-4">
          {/* Filter bar: user, what, where, date range, plus free-text search. */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs text-muted-foreground">User</Label>
              <Select value={activeActor} onValueChange={(v) => pushParams({ actor: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="All users" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All users</SelectItem>
                  {actors.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label className="text-xs text-muted-foreground">What changed</Label>
              <Select value={activeAction} onValueChange={(v) => pushParams({ action: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="All actions" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All actions</SelectItem>
                  {actions.map((a) => (
                    <SelectItem key={a} value={a}>
                      {humanize(a)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label className="text-xs text-muted-foreground">Where (area)</Label>
              <Select value={activeEntity} onValueChange={(v) => pushParams({ entity: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="All areas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All areas</SelectItem>
                  {entities.map((e) => (
                    <SelectItem key={e} value={e}>
                      {humanize(e)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label className="text-xs text-muted-foreground" htmlFor="from-date">
                From date
              </Label>
              <Input
                id="from-date"
                type="date"
                value={fromDate}
                max={toDate || undefined}
                onChange={(e) => pushParams({ from: e.target.value })}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label className="text-xs text-muted-foreground" htmlFor="to-date">
                To date
              </Label>
              <Input
                id="to-date"
                type="date"
                value={toDate}
                min={fromDate || undefined}
                onChange={(e) => pushParams({ to: e.target.value })}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label className="text-xs text-muted-foreground" htmlFor="q">
                Search
              </Label>
              <form onSubmit={onSearch} className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="q"
                  value={term}
                  onChange={(e) => setTerm(e.target.value)}
                  placeholder="User, target or ID"
                  className="pl-8"
                />
              </form>
            </div>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="text-base">
              Recent activity
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                showing latest {rows.length} of up to {pageSize}
              </span>
            </CardTitle>
            {hasFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearAll}
                className="self-start text-muted-foreground sm:self-auto"
              >
                <X className="mr-1 h-4 w-4" />
                Clear filters
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-16 text-center">
              <ScrollText className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                No activity matches the current filters.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-40">When</TableHead>
                    <TableHead>What</TableHead>
                    <TableHead className="w-32">Where</TableHead>
                    <TableHead>User</TableHead>
                    <TableHead>Target</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((log) => {
                    const hasDetail =
                      log.metadata && Object.keys(log.metadata).length > 0
                    return (
                      <Collapsible key={log.id} asChild>
                        <>
                          <TableRow className={isPending ? 'opacity-60' : undefined}>
                            <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                              {formatWhen(log.created_at)}
                            </TableCell>
                            <TableCell>
                              <Badge variant={ACTION_TONE[log.action] ?? 'secondary'}>
                                {humanize(log.action)}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-sm">
                              {log.entity_type ? (
                                <span className="capitalize">{humanize(log.entity_type)}</span>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </TableCell>
                            <TableCell className="text-sm">
                              <div className="font-medium">
                                {log.actor_email ?? 'System'}
                              </div>
                              {log.actor_role && (
                                <div className="text-xs capitalize text-muted-foreground">
                                  {log.actor_role}
                                </div>
                              )}
                            </TableCell>
                            <TableCell className="text-sm">
                              <div>{log.target_label ?? '—'}</div>
                              {log.entity_id && (
                                <div className="font-mono text-xs text-muted-foreground">
                                  {log.entity_id.slice(0, 8)}
                                </div>
                              )}
                            </TableCell>
                            <TableCell>
                              {hasDetail && (
                                <CollapsibleTrigger className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted">
                                  <ChevronDown className="h-4 w-4" />
                                  <span className="sr-only">Toggle details</span>
                                </CollapsibleTrigger>
                              )}
                            </TableCell>
                          </TableRow>
                          {hasDetail && (
                            <CollapsibleContent asChild>
                              <TableRow className="hover:bg-transparent">
                                <TableCell colSpan={6} className="bg-muted/40">
                                  <pre className="overflow-x-auto whitespace-pre-wrap text-xs text-muted-foreground">
                                    {JSON.stringify(log.metadata, null, 2)}
                                  </pre>
                                </TableCell>
                              </TableRow>
                            </CollapsibleContent>
                          )}
                        </>
                      </Collapsible>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
