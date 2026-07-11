import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { STATUS_TONE_CLASS } from '@/lib/status-colors'
import { CircleDot, PauseCircle, XCircle } from 'lucide-react'
import type { BillingAccountStatus } from '@/lib/types/database'

const STATUS_META: Record<
  BillingAccountStatus,
  { label: string; tone: keyof typeof STATUS_TONE_CLASS; icon: typeof CircleDot }
> = {
  live: { label: 'Live', tone: 'success', icon: CircleDot },
  suspended: { label: 'Suspended', tone: 'warning', icon: PauseCircle },
  dead: { label: 'Closed', tone: 'neutral', icon: XCircle },
}

export function BillingStatusBadge({
  status,
  className,
}: {
  status: BillingAccountStatus
  className?: string
}) {
  const meta = STATUS_META[status]
  const Icon = meta.icon
  return (
    <Badge variant="outline" className={cn('gap-1', STATUS_TONE_CLASS[meta.tone], className)}>
      <Icon className="h-3 w-3" />
      {meta.label}
    </Badge>
  )
}
