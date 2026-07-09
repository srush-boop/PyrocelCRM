'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { PoundSterling } from 'lucide-react'
import { formatGBP } from '@/lib/utils'
import { BAND_META, type OncallSummaryRow, type OncallRates } from '@/lib/oncall/types'

interface OncallSummaryProps {
  summary: OncallSummaryRow[]
  rates: OncallRates
  monthLabel: string
}

export function OncallSummary({ summary, rates, monthLabel }: OncallSummaryProps) {
  const hasRates = rates.weekdayEvening != null || rates.weekend != null || rates.bankHoliday != null

  const totals = summary.reduce(
    (acc, r) => {
      acc.weekdayEvening += r.weekdayEvening
      acc.weekend += r.weekend
      acc.bankHoliday += r.bankHoliday
      acc.total += r.total
      acc.pay += r.pay ?? 0
      return acc
    },
    { weekdayEvening: 0, weekend: 0, bankHoliday: 0, total: 0, pay: 0 },
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <PoundSterling className="h-5 w-5" />
          On-call summary — {monthLabel}
        </CardTitle>
        <CardDescription>
          Shift counts by pay band per engineer, ready to feed into timesheets and payroll.
          {!hasRates && ' Set pay rates in Settings to calculate pay.'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {summary.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No on-call shifts assigned in this period.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Engineer</TableHead>
                <TableHead className="text-right">{BAND_META.weekday_evening.short}</TableHead>
                <TableHead className="text-right">{BAND_META.weekend.short}</TableHead>
                <TableHead className="text-right">{BAND_META.bank_holiday.short}</TableHead>
                <TableHead className="text-right">Total</TableHead>
                {hasRates && <TableHead className="text-right">Pay</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {summary.map((r) => (
                <TableRow key={r.engineerId}>
                  <TableCell className="font-medium">{r.engineerName ?? 'Engineer'}</TableCell>
                  <TableCell className="text-right">{r.weekdayEvening}</TableCell>
                  <TableCell className="text-right">{r.weekend}</TableCell>
                  <TableCell className="text-right">{r.bankHoliday}</TableCell>
                  <TableCell className="text-right font-medium">{r.total}</TableCell>
                  {hasRates && (
                    <TableCell className="text-right">{r.pay != null ? formatGBP(r.pay) : '—'}</TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell className="font-semibold">Total</TableCell>
                <TableCell className="text-right">{totals.weekdayEvening}</TableCell>
                <TableCell className="text-right">{totals.weekend}</TableCell>
                <TableCell className="text-right">{totals.bankHoliday}</TableCell>
                <TableCell className="text-right font-semibold">{totals.total}</TableCell>
                {hasRates && <TableCell className="text-right font-semibold">{formatGBP(totals.pay)}</TableCell>}
              </TableRow>
            </TableFooter>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}
