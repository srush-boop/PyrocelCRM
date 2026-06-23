'use client'

import { Bar, BarChart, CartesianGrid, XAxis } from 'recharts'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'

const chartConfig = {
  completed: { label: 'Completed', color: 'var(--chart-1)' },
} satisfies ChartConfig

export interface CompletionsPoint {
  week: string
  completed: number
}

// Weekly completed-task volume for the last several weeks. Purely presentational;
// the server buckets the data and passes it in.
export function CompletionsChart({ data }: { data: CompletionsPoint[] }) {
  return (
    <ChartContainer config={chartConfig} className="h-[240px] w-full">
      <BarChart accessibilityLayer data={data} margin={{ left: 0, right: 8, top: 8 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="week" tickLine={false} axisLine={false} tickMargin={8} fontSize={12} />
        <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
        <Bar dataKey="completed" fill="var(--color-completed)" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ChartContainer>
  )
}
