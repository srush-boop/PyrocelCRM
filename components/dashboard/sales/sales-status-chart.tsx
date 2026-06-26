'use client'

import { Bar, BarChart, CartesianGrid, Cell, LabelList, XAxis, YAxis } from 'recharts'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'

export type SalesStatusDatum = {
  status: string
  label: string
  /** Total quote value for this status, in whole pounds. */
  value: number
  count: number
  fill: string
}

const chartConfig: ChartConfig = {
  value: { label: 'Value' },
}

const gbp0 = new Intl.NumberFormat('en-GB', {
  style: 'currency',
  currency: 'GBP',
  maximumFractionDigits: 0,
})

export function SalesStatusChart({ data }: { data: SalesStatusDatum[] }) {
  const hasValue = data.some((d) => d.value > 0)

  if (!hasValue) {
    return (
      <div className="flex h-[260px] items-center justify-center text-sm text-muted-foreground">
        No quote value to chart yet.
      </div>
    )
  }

  return (
    <ChartContainer config={chartConfig} className="h-[260px] w-full">
      <BarChart accessibilityLayer data={data} margin={{ top: 24, right: 12, left: 12, bottom: 0 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis
          dataKey="label"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          className="text-xs"
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          width={56}
          tickFormatter={(v: number) => gbp0.format(v)}
          className="text-xs"
        />
        <ChartTooltip
          cursor={false}
          content={
            <ChartTooltipContent
              formatter={(value, _name, item) => {
                const datum = item?.payload as SalesStatusDatum | undefined
                return (
                  <div className="flex flex-col gap-0.5">
                    <span className="font-medium">{gbp0.format(Number(value))}</span>
                    <span className="text-muted-foreground">
                      {datum?.count ?? 0} quote{(datum?.count ?? 0) === 1 ? '' : 's'}
                    </span>
                  </div>
                )
              }}
            />
          }
        />
        <Bar dataKey="value" radius={[6, 6, 0, 0]}>
          {data.map((d) => (
            <Cell key={d.status} fill={d.fill} />
          ))}
          <LabelList
            dataKey="count"
            position="top"
            className="fill-muted-foreground text-xs"
          />
        </Bar>
      </BarChart>
    </ChartContainer>
  )
}
