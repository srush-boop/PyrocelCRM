import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Plus,
  ReceiptText,
  TrendingUp,
  CheckCircle2,
  Percent,
  ArrowRight,
  CalendarClock,
} from 'lucide-react'
import { SalesStatusChart, type SalesStatusDatum } from '@/components/dashboard/sales/sales-status-chart'
import { BranchFilter } from '@/components/dashboard/branch-filter'
import { getBranchScope } from '@/lib/branches'
import { formatPence, QUOTE_STATUS_META, quoteTypeLabel } from '@/lib/sales'
import { cn, formatDateUK } from '@/lib/utils'
import type { Profile, Quote, QuoteStatus } from '@/lib/types/database'

export const metadata = {
  title: 'Sales Dashboard | Pyrocel',
  description: 'Pipeline, win rate and quoting activity at a glance.',
}

// Fill colour per status, mapped to the theme chart tokens.
const statusFill: Record<QuoteStatus, string> = {
  draft: 'var(--color-chart-2)',
  sent: 'var(--color-chart-3)',
  accepted: 'var(--color-chart-4)',
  rejected: 'var(--color-chart-1)',
  expired: 'var(--color-chart-5)',
}

const STATUS_ORDER: QuoteStatus[] = ['draft', 'sent', 'accepted', 'rejected', 'expired']

// Collapse a quote group (a reference shared across revisions/variants) to a
// single representative quote so pipeline figures are not inflated by clones.
function dedupeByReference(quotes: Quote[]): Quote[] {
  const groups = new Map<string, Quote[]>()
  for (const q of quotes) {
    const key = q.reference ?? q.id
    const arr = groups.get(key) ?? []
    arr.push(q)
    groups.set(key, arr)
  }
  const out: Quote[] = []
  for (const arr of groups.values()) {
    arr.sort((a, b) => {
      if (a.is_master !== b.is_master) return a.is_master ? -1 : 1
      if (a.revision !== b.revision) return b.revision - a.revision
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    })
    out.push(arr[0])
  }
  return out
}

export default async function SalesDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ branch?: string }>
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  if (!profile || !['admin', 'office'].includes((profile as Profile).role)) {
    redirect('/dashboard')
  }

  const { branch } = await searchParams
  const scope = await getBranchScope(profile as Profile, branch)

  const { data: rawQuotesData } = await supabase
    .from('quotes')
    .select('*, client:clients(id, name), site:sites(id, name, branch_id)')
    .order('created_at', { ascending: false })

  // Scope by the quote's site branch when a branch is active.
  const allQuotes = scope.activeBranchId
    ? ((rawQuotesData ?? []) as Quote[]).filter(
        (q) => (q.site as { branch_id?: string | null } | null)?.branch_id === scope.activeBranchId,
      )
    : ((rawQuotesData ?? []) as Quote[])
  const quotes = dedupeByReference(allQuotes)

  // Aggregate counts and value (total_pence) per status.
  const byStatus = STATUS_ORDER.reduce(
    (acc, s) => {
      acc[s] = { count: 0, value: 0 }
      return acc
    },
    {} as Record<QuoteStatus, { count: number; value: number }>,
  )
  for (const q of quotes) {
    const s = (q.status ?? 'draft') as QuoteStatus
    if (!byStatus[s]) byStatus[s] = { count: 0, value: 0 }
    byStatus[s].count += 1
    byStatus[s].value += q.total_pence ?? 0
  }

  const totalCount = quotes.length
  const pipelinePence = byStatus.draft.value + byStatus.sent.value
  const openCount = byStatus.draft.count + byStatus.sent.count
  const acceptedPence = byStatus.accepted.value
  const acceptedCount = byStatus.accepted.count
  const decidedCount = byStatus.accepted.count + byStatus.rejected.count
  const winRate = decidedCount > 0 ? Math.round((acceptedCount / decidedCount) * 100) : null

  // Sent quotes whose validity expires within the next 14 days.
  const now = Date.now()
  const soonMs = 14 * 24 * 60 * 60 * 1000
  const expiringSoon = quotes.filter(
    (q) =>
      q.status === 'sent' &&
      q.valid_until &&
      new Date(q.valid_until).getTime() - now <= soonMs &&
      new Date(q.valid_until).getTime() >= now,
  ).length

  const chartData: SalesStatusDatum[] = STATUS_ORDER.map((s) => ({
    status: s,
    label: QUOTE_STATUS_META[s].label,
    value: Math.round(byStatus[s].value / 100),
    count: byStatus[s].count,
    fill: statusFill[s],
  }))

  const recentQuotes = allQuotes.slice(0, 6)

  const kpis = [
    {
      label: 'Total Quotes',
      value: String(totalCount),
      hint: `${openCount} open`,
      icon: ReceiptText,
    },
    {
      label: 'Pipeline Value',
      value: formatPence(pipelinePence),
      hint: `${openCount} draft & sent`,
      icon: TrendingUp,
    },
    {
      label: 'Accepted Value',
      value: formatPence(acceptedPence),
      hint: `${acceptedCount} won`,
      icon: CheckCircle2,
    },
    {
      label: 'Win Rate',
      value: winRate === null ? '—' : `${winRate}%`,
      hint: decidedCount > 0 ? `of ${decidedCount} decided` : 'no decisions yet',
      icon: Percent,
    },
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-balance">Sales Dashboard</h1>
          <p className="text-muted-foreground">
            Pipeline, win rate and quoting activity across the portfolio.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <BranchFilter branches={scope.branches} activeBranchId={scope.activeBranchId} />
          <Button asChild>
            <Link href="/dashboard/sales/new">
              <Plus className="mr-2 h-4 w-4" />
              New quote
            </Link>
          </Button>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((kpi) => (
          <Card key={kpi.label}>
            <CardContent className="flex items-start justify-between gap-3 p-5">
              <div className="min-w-0">
                <p className="text-sm font-medium text-muted-foreground">{kpi.label}</p>
                <p className="mt-1 truncate text-2xl font-bold tabular-nums">{kpi.value}</p>
                <p className="mt-1 text-xs text-muted-foreground">{kpi.hint}</p>
              </div>
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                <kpi.icon className="h-5 w-5" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-7">
        {/* Value by status chart */}
        <Card className="lg:col-span-4">
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <CardTitle className="text-base">Quote value by status</CardTitle>
            {expiringSoon > 0 && (
              <span className="inline-flex items-center gap-1.5 rounded-md bg-amber-100 px-2 py-1 text-xs font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                <CalendarClock className="h-3.5 w-3.5" />
                {expiringSoon} expiring soon
              </span>
            )}
          </CardHeader>
          <CardContent>
            <SalesStatusChart data={chartData} />
          </CardContent>
        </Card>

        {/* Recent quotes */}
        <Card className="lg:col-span-3">
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <CardTitle className="text-base">Recent quotes</CardTitle>
            <Button variant="ghost" size="sm" asChild className="-mr-2 h-8 text-muted-foreground">
              <Link href="/dashboard/sales/quotes">
                View all
                <ArrowRight className="ml-1 h-4 w-4" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            {recentQuotes.length === 0 ? (
              <p className="px-6 pb-6 text-sm text-muted-foreground">No quotes yet.</p>
            ) : (
              <ul className="divide-y divide-border">
                {recentQuotes.map((q) => {
                  const meta = QUOTE_STATUS_META[(q.status ?? 'draft') as QuoteStatus]
                  return (
                    <li key={q.id}>
                      <Link
                        href={`/dashboard/sales/${q.id}`}
                        className="flex items-center justify-between gap-3 px-6 py-3 transition-colors hover:bg-muted/50"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">
                            {q.quote_number ? `${q.quote_number} · ` : ''}
                            {q.title || quoteTypeLabel(q.quote_type)}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {q.client?.name ?? q.prospect_name ?? 'No client'} ·{' '}
                            {formatDateUK(q.created_at)}
                          </p>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1">
                          <span className="text-sm font-semibold tabular-nums">
                            {formatPence(q.total_pence ?? 0)}
                          </span>
                          <Badge variant="secondary" className={cn('text-xs', meta.badgeClass)}>
                            {meta.label}
                          </Badge>
                        </div>
                      </Link>
                    </li>
                  )
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
