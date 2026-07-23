'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
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
import { ScrollText, Search, ChevronDown } from 'lucide-react'

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

// Higher-risk actions get a destructive/amber tone so they stand out in the log.
const ACTION_TONE: Record<string, 'destructive' | 'default' | 'secondary'> = {
  'user.delete': 'destructive',
  'user.role_change': 'destructive',
  'client_user.delete': 'destructive',
  'user.status_change': 'default',
  'user.permission_change': 'default',
  'user.password_reset': 'default',
}

function actionLabel(action: string) {
  return action
    .replace(/[._]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
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
  pageSize,
  activeAction,
  query,
}: {
  logs: AuditLogEntry[]
  actions: string[]
  pageSize: number
  activeAction: string
  query: string
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()
  const [term, setTerm] = useState(query)

  const pushParams = (next: { action?: string; q?: string }) => {
    const params = new URLSearchParams(searchParams.toString())
    if (next.action !== undefined) {
      if (next.action === 'all') params.delete('action')
      else params.set('action', next.action)
    }
    if (next.q !== undefined) {
      if (!next.q) params.delete('q')
      else params.set('q', next.q)
    }
    startTransition(() => router.push(`/dashboard/audit-log?${params.toString()}`))
  }

  const onSearch = (e: React.FormEvent) => {
    e.preventDefault()
    pushParams({ q: term })
  }

  const rows = useMemo(() => logs, [logs])

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <header className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
          <ScrollText className="h-5 w-5 text-muted-foreground" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-balance">Audit Log</h1>
          <p className="text-sm text-muted-foreground">
            Security-relevant events: account changes, permission changes and sign-ins.
          </p>
        </div>
      </header>

      <Card>
        <CardHeader className="gap-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="text-base">
              Recent activity
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                showing latest {rows.length} of up to {pageSize}
              </span>
            </CardTitle>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Select
                value={activeAction}
                onValueChange={(v) => pushParams({ action: v })}
              >
                <SelectTrigger className="w-full sm:w-52">
                  <SelectValue placeholder="All actions" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All actions</SelectItem>
                  {actions.map((a) => (
                    <SelectItem key={a} value={a}>
                      {actionLabel(a)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <form onSubmit={onSearch} className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={term}
                  onChange={(e) => setTerm(e.target.value)}
                  placeholder="Search user, target, ID"
                  className="w-full pl-8 sm:w-64"
                />
              </form>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-16 text-center">
              <ScrollText className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                No audit events match the current filters.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-40">When</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Actor</TableHead>
                    <TableHead>Target</TableHead>
                    <TableHead className="w-36">IP</TableHead>
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
                          <TableRow
                            className={isPending ? 'opacity-60' : undefined}
                          >
                            <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                              {formatWhen(log.created_at)}
                            </TableCell>
                            <TableCell>
                              <Badge variant={ACTION_TONE[log.action] ?? 'secondary'}>
                                {actionLabel(log.action)}
                              </Badge>
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
                            <TableCell className="whitespace-nowrap font-mono text-xs text-muted-foreground">
                              {log.ip_address ?? '—'}
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
