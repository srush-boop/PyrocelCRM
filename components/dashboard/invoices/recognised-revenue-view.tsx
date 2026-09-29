'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { AlertTriangle, ChevronRight } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { cn } from '@/lib/utils'
import { formatPence } from '@/lib/billing/invoices'
import {
  BASIS_LABELS,
  BASIS_ORDER,
  type RecognisedRevenue,
  type RecognitionMonth,
} from '@/lib/billing/recognised-revenue'
import type { RecognitionSource } from '@/lib/actions/recognised-revenue'

function monthLabel(key: string, style: 'short' | 'long' = 'short'): string {
  const [y, m] = key.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-GB', {
    month: style,
    year: 'numeric',
    timeZone: 'UTC',
  })
}

function money(pence: number) {
  return <span className={cn('tabular-nums', pence < 0 && 'text-destructive')}>{formatPence(pence)}</span>
}

export function RecognisedRevenueView({
  data,
  years,
  source,
}: {
  data: RecognisedRevenue
  years: number[]
  source: RecognitionSource
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const currentKey = new Date().toISOString().slice(0, 7)
  const [selected, setSelected] = useState<string | null>(
    data.months.find((m) => m.month === currentKey)?.month ?? null,
  )

  function setParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString())
    params.set(key, value)
    router.push(`${pathname}?${params.toString()}`)
  }

  const { totals } = data
  const selectedMonth = data.months.find((m) => m.month === selected) ?? null
  const peak = Math.max(1, ...data.months.map((m) => Math.abs(m.recognisedPence)))

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="rr-year">Year</Label>
          <Select value={String(data.year)} onValueChange={(v) => setParam('year', v)}>
            <SelectTrigger id="rr-year" className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {years.map((y) => (
                <SelectItem key={y} value={String(y)}>
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="rr-source">Invoices included</Label>
          <Select value={source} onValueChange={(v) => setParam('source', v)}>
            <SelectTrigger id="rr-source" className="w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="sage">Exported to Sage</SelectItem>
              <SelectItem value="issued">All issued (incl. not yet exported)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard
          label={`Recognised in ${data.year}`}
          value={totals.recognisedPence}
          hint="Real value earned across the year"
          emphasis
        />
        <SummaryCard
          label="Invoiced (face value)"
          value={totals.invoicedPence + totals.creditedPence}
          hint={`${formatPence(totals.invoicedPence)} invoiced · ${formatPence(totals.creditedPence)} credits`}
        />
        <SummaryCard
          label="Brought in from prior year"
          value={totals.broughtForwardFromPriorYearPence}
          hint={`Earned in ${data.year} from ${data.year - 1} invoices`}
        />
        <SummaryCard
          label="Deferred into next year"
          value={totals.deferredAtYearEndPence}
          hint={`Invoiced in ${data.year}, earned in ${data.year + 1}`}
        />
      </div>

      {data.unmatchedLineCount > 0 && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <p className="text-pretty">
            {data.unmatchedLineCount} recurring line{data.unmatchedLineCount === 1 ? '' : 's'} in{' '}
            {data.year} couldn&apos;t be matched to a recurring charge, so{' '}
            {data.unmatchedLineCount === 1 ? 'it is' : 'they are'} counted in full in the invoice
            month. Look for &ldquo;Unmatched&rdquo; in the month detail.
          </p>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Month by month</CardTitle>
          <CardDescription>
            Select a month to see which invoices make up its recognised value.
          </CardDescription>
        </CardHeader>
        <CardContent className="px-0 sm:px-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Month</TableHead>
                <TableHead className="text-right">Invoiced</TableHead>
                <TableHead className="text-right">Credits</TableHead>
                <TableHead className="hidden text-right md:table-cell">From this month</TableHead>
                <TableHead className="hidden text-right md:table-cell">From earlier months</TableHead>
                <TableHead className="text-right">Recognised</TableHead>
                <TableHead className="hidden text-right lg:table-cell">Deferred balance</TableHead>
                <TableHead className="w-8">
                  <span className="sr-only">Details</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.months.map((m) => (
                <MonthRow
                  key={m.month}
                  month={m}
                  peak={peak}
                  active={m.month === selected}
                  current={m.month === currentKey}
                  onSelect={() => setSelected(m.month === selected ? null : m.month)}
                />
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell className="font-semibold">Total</TableCell>
                <TableCell className="text-right font-semibold">{money(totals.invoicedPence)}</TableCell>
                <TableCell className="text-right font-semibold">{money(totals.creditedPence)}</TableCell>
                <TableCell className="hidden text-right font-semibold md:table-cell">
                  {money(data.months.reduce((s, m) => s + m.fromCurrentPence, 0))}
                </TableCell>
                <TableCell className="hidden text-right font-semibold md:table-cell">
                  {money(data.months.reduce((s, m) => s + m.broughtForwardPence, 0))}
                </TableCell>
                <TableCell className="text-right font-semibold">{money(totals.recognisedPence)}</TableCell>
                <TableCell className="hidden text-right font-semibold lg:table-cell">
                  {money(data.months[11]?.deferredClosingPence ?? 0)}
                </TableCell>
                <TableCell />
              </TableRow>
            </TableFooter>
          </Table>
        </CardContent>
      </Card>

      {selectedMonth && <MonthDetail month={selectedMonth} />}

      <Card>
        <CardHeader>
          <CardTitle>Recognised by invoice frequency</CardTitle>
          <CardDescription>{data.year} totals by how each line is spread.</CardDescription>
        </CardHeader>
        <CardContent className="px-0 sm:px-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Frequency</TableHead>
                <TableHead className="text-right">Recognised</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {BASIS_ORDER.filter((b) => totals.byBasis[b]).map((b) => (
                <TableRow key={b}>
                  <TableCell>{BASIS_LABELS[b]}</TableCell>
                  <TableCell className="text-right">{money(totals.byBasis[b] ?? 0)}</TableCell>
                </TableRow>
              ))}
              {!Object.keys(totals.byBasis).length && (
                <TableRow>
                  <TableCell colSpan={2} className="py-8 text-center text-muted-foreground">
                    No recurring revenue recognised in {data.year}.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}

function SummaryCard({
  label,
  value,
  hint,
  emphasis,
}: {
  label: string
  value: number
  hint: string
  emphasis?: boolean
}) {
  return (
    <Card className={cn(emphasis && 'border-primary/40 bg-primary/5')}>
      <CardHeader className="pb-2">
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-2xl">{money(value)}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  )
}

function MonthRow({
  month,
  peak,
  active,
  current,
  onSelect,
}: {
  month: RecognitionMonth
  peak: number
  active: boolean
  current: boolean
  onSelect: () => void
}) {
  const width = Math.round((Math.abs(month.recognisedPence) / peak) * 100)
  return (
    <TableRow
      data-state={active ? 'selected' : undefined}
      className="cursor-pointer"
      onClick={onSelect}
    >
      <TableCell className="font-medium">
        <button
          type="button"
          className="flex items-center gap-2 text-left focus-visible:outline-none focus-visible:underline"
          aria-expanded={active}
          onClick={(e) => {
            e.stopPropagation()
            onSelect()
          }}
        >
          {monthLabel(month.month)}
          {current && (
            <Badge variant="outline" className="text-[10px]">
              This month
            </Badge>
          )}
        </button>
      </TableCell>
      <TableCell className="text-right text-muted-foreground">{money(month.invoicedPence)}</TableCell>
      <TableCell className="text-right text-muted-foreground">{money(month.creditedPence)}</TableCell>
      <TableCell className="hidden text-right md:table-cell">{money(month.fromCurrentPence)}</TableCell>
      <TableCell className="hidden text-right md:table-cell">{money(month.broughtForwardPence)}</TableCell>
      <TableCell className="text-right">
        <div className="flex flex-col items-end gap-1">
          <span className="font-semibold">{money(month.recognisedPence)}</span>
          <span className="h-1 w-24 overflow-hidden rounded-full bg-muted" aria-hidden>
            <span className="block h-full rounded-full bg-primary" style={{ width: `${width}%` }} />
          </span>
        </div>
      </TableCell>
      <TableCell className="hidden text-right text-muted-foreground lg:table-cell">
        {money(month.deferredClosingPence)}
      </TableCell>
      <TableCell>
        <ChevronRight
          className={cn('h-4 w-4 text-muted-foreground transition-transform', active && 'rotate-90')}
          aria-hidden
        />
      </TableCell>
    </TableRow>
  )
}

function MonthDetail({ month }: { month: RecognitionMonth }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{monthLabel(month.month, 'long')}</CardTitle>
        <CardDescription>
          {formatPence(month.fromCurrentPence)} from this month&apos;s invoices +{' '}
          {formatPence(month.broughtForwardPence)} from earlier months ={' '}
          <span className="font-semibold text-foreground">{formatPence(month.recognisedPence)}</span>
        </CardDescription>
      </CardHeader>
      <CardContent className="px-0 sm:px-6">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Invoice</TableHead>
              <TableHead className="hidden md:table-cell">Line</TableHead>
              <TableHead>Frequency</TableHead>
              <TableHead className="hidden sm:table-cell">Invoiced</TableHead>
              <TableHead className="hidden text-right sm:table-cell">Face value</TableHead>
              <TableHead className="text-right">This month</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {month.contributions.map((c) => (
              <TableRow key={`${c.lineId}-${c.monthIndex}`}>
                <TableCell>
                  <div className="flex flex-col">
                    <Link
                      href={`/dashboard/invoices/${c.invoiceId}`}
                      className="font-medium text-primary hover:underline"
                    >
                      {c.invoiceNumber}
                    </Link>
                    <span className="text-xs text-muted-foreground">
                      {c.documentType === 'credit_note' ? 'Credit note' : c.clientName ?? '—'}
                    </span>
                  </div>
                </TableCell>
                <TableCell className="hidden max-w-0 md:table-cell md:w-full">
                  <span className="block truncate text-sm" title={c.description}>
                    {c.description}
                  </span>
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  <div className="flex flex-col">
                    <span className={cn('text-sm', c.basis === 'unmatched' && 'text-amber-700 dark:text-amber-400')}>
                      {BASIS_LABELS[c.basis]}
                    </span>
                    {c.monthsTotal > 1 && (
                      <span className="text-xs text-muted-foreground">
                        Month {c.monthIndex} of {c.monthsTotal}
                      </span>
                    )}
                  </div>
                </TableCell>
                <TableCell className="hidden whitespace-nowrap text-sm text-muted-foreground sm:table-cell">
                  {monthLabel(c.invoiceMonth)}
                </TableCell>
                <TableCell className="hidden text-right text-muted-foreground sm:table-cell">
                  {money(c.facePence)}
                </TableCell>
                <TableCell className="text-right font-medium">{money(c.sharePence)}</TableCell>
              </TableRow>
            ))}
            {!month.contributions.length && (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                  Nothing recognised in this month.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
