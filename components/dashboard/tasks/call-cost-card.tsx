import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Lock, TrendingDown, TrendingUp } from 'lucide-react'
import { formatPence } from '@/lib/billing/invoices'
import { formatMarginPct } from '@/lib/billing/labour-profit'
import type { CallProfitResult } from '@/lib/billing/call-profit-data'

const REVENUE_SOURCE_LABEL: Record<CallProfitResult['revenueSource'], string> = {
  invoice: 'From the invoiced amount',
  recurring_visit: 'Apportioned from the recurring contract value',
  none: 'No revenue recorded for this call',
}

/**
 * Owner/permitted-viewer-only labour cost + profitability card for a completed
 * call. Never rendered unless the page has already checked the viewer may see
 * labour costs — this component does not gate itself.
 */
export function CallCostCard({ profit }: { profit: CallProfitResult }) {
  const { costPence, revenuePence, profitPence, marginPct, revenueSource } = profit
  const revenueKnown = revenueSource !== 'none'
  const inProfit = profitPence >= 0

  const hoursLabel =
    profit.onSiteHours > 0
      ? `${profit.onSiteHours.toFixed(2)} hrs on site`
      : 'On-site time not recorded'
  const rateLabel =
    profit.costPerHourPence != null
      ? `${formatPence(profit.costPerHourPence)}/hr`
      : 'No cost rate set'

  // Total cost is labour + parts. Show the split so the parts contribution is
  // always visible (parts cost is included on every call).
  const costSub =
    profit.partsCostPence > 0
      ? `Labour ${formatPence(profit.labourCostPence)} + parts ${formatPence(profit.partsCostPence)}`
      : `${hoursLabel} · ${rateLabel}`

  return (
    <Card className="border-amber-200 bg-amber-50/40">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Lock className="h-4 w-4 text-amber-600" />
          Call profitability
          <span className="ml-auto text-xs font-normal text-muted-foreground">
            Restricted &middot; not shown to the client
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Metric label="Cost" value={formatPence(costPence)} sub={costSub} />
          <Metric
            label="Revenue"
            value={revenueKnown ? formatPence(revenuePence) : '\u2014'}
            sub={REVENUE_SOURCE_LABEL[revenueSource]}
          />
          <Metric
            label="Profit"
            value={revenueKnown ? formatPence(profitPence) : '\u2014'}
            valueClassName={
              revenueKnown ? (inProfit ? 'text-emerald-700' : 'text-red-700') : undefined
            }
            icon={
              revenueKnown ? (
                inProfit ? (
                  <TrendingUp className="h-4 w-4 text-emerald-600" />
                ) : (
                  <TrendingDown className="h-4 w-4 text-red-600" />
                )
              ) : null
            }
          />
          <Metric
            label="Margin"
            value={formatMarginPct(marginPct)}
            valueClassName={
              marginPct == null ? undefined : marginPct >= 0 ? 'text-emerald-700' : 'text-red-700'
            }
          />
        </div>
        {!profit.costKnown && (
          <p className="text-xs text-amber-700">
            No cost/hour is set for this engineer (or their role), so the labour cost is shown as
            zero. Set a cost rate in Settings to see accurate profitability.
          </p>
        )}
      </CardContent>
    </Card>
  )
}

function Metric({
  label,
  value,
  sub,
  valueClassName,
  icon,
}: {
  label: string
  value: string
  sub?: string
  valueClassName?: string
  icon?: React.ReactNode
}) {
  return (
    <div className="space-y-0.5">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className={`flex items-center gap-1 text-lg font-semibold tabular-nums ${valueClassName ?? ''}`}>
        {icon}
        {value}
      </p>
      {sub && <p className="text-[11px] leading-tight text-muted-foreground">{sub}</p>}
    </div>
  )
}
