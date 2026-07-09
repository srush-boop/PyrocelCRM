import { Card, CardContent } from '@/components/ui/card'
import { Package, User, Warehouse, AlertTriangle } from 'lucide-react'
import { formatCurrency } from '@/lib/assets'
import type { Asset } from '@/lib/types/database'

interface AssetSummaryCardsProps {
  assets: Asset[]
  dueSoonCount: number
  overdueCount: number
}

export function AssetSummaryCards({ assets, dueSoonCount, overdueCount }: AssetSummaryCardsProps) {
  const active = assets.filter((a) => a.status === 'active')
  const totalValue = active.reduce((sum, a) => sum + (a.value ?? 0), 0)
  const assignedCount = active.filter((a) => a.assigned_to).length
  const storedCount = active.filter((a) => !a.assigned_to).length

  const cards = [
    {
      label: 'Active assets',
      value: String(active.length),
      sub: `${formatCurrency(totalValue)} total value`,
      icon: Package,
      tone: 'text-foreground',
    },
    {
      label: 'Assigned',
      value: String(assignedCount),
      sub: 'in someone\u2019s care',
      icon: User,
      tone: 'text-foreground',
    },
    {
      label: 'In storage',
      value: String(storedCount),
      sub: 'unassigned / stored',
      icon: Warehouse,
      tone: 'text-foreground',
    },
    {
      label: 'Checks due',
      value: String(dueSoonCount + overdueCount),
      sub: overdueCount > 0 ? `${overdueCount} overdue` : 'none overdue',
      icon: AlertTriangle,
      tone: overdueCount > 0 ? 'text-destructive' : 'text-foreground',
    },
  ]

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {cards.map((c) => {
        const Icon = c.icon
        return (
          <Card key={c.label}>
            <CardContent className="flex items-start justify-between gap-2 p-4">
              <div className="min-w-0">
                <p className="text-xs font-medium text-muted-foreground">{c.label}</p>
                <p className={`mt-1 text-2xl font-bold ${c.tone}`}>{c.value}</p>
                <p className="truncate text-xs text-muted-foreground">{c.sub}</p>
              </div>
              <Icon className={`h-5 w-5 shrink-0 ${c.tone}`} />
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
