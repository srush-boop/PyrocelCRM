import { Card, CardContent } from '@/components/ui/card'
import { CalendarClock, ClipboardList, PlayCircle } from 'lucide-react'
import { getSubcontractorContext, getMyCalls } from '@/lib/subcontractor/portal-data'
import { PortalCallCard } from '@/components/subcontractor/portal-call-card'

export default async function SubcontractorHomePage() {
  const ctx = await getSubcontractorContext()
  const calls = await getMyCalls(ctx)

  const today = new Date().toISOString().split('T')[0]
  const now = new Date()
  const weekEnd = new Date(now)
  weekEnd.setDate(now.getDate() + 7)
  const weekEndStr = weekEnd.toISOString().split('T')[0]

  const dueToday = calls.filter((c) => c.scheduledDate === today).length
  const dueThisWeek = calls.filter(
    (c) => c.scheduledDate && c.scheduledDate >= today && c.scheduledDate <= weekEndStr,
  ).length
  const inProgress = calls.filter((c) => c.status === 'in_progress' || c.status === 'paused').length

  const stats = [
    { label: 'Due today', value: dueToday, icon: CalendarClock },
    { label: 'Due this week', value: dueThisWeek, icon: ClipboardList },
    { label: 'In progress', value: inProgress, icon: PlayCircle },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          {ctx.isLead ? 'Company calls' : 'Calls issued to you'}
        </h1>
        <p className="text-muted-foreground">
          {ctx.isLead
            ? 'All open calls for services allocated to your company. Open a call to upload quotes or issue it to a worker.'
            : 'The calls currently issued to you. Open a call to view details and upload information.'}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <CardContent className="flex items-center gap-3 py-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                <stat.icon className="h-5 w-5" aria-hidden="true" />
              </div>
              <div>
                <p className="text-2xl font-bold leading-none tabular-nums">{stat.value}</p>
                <p className="text-sm text-muted-foreground">{stat.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {calls.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            You have no open calls right now.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {calls.map((call) => (
            <PortalCallCard key={call.id} call={call} />
          ))}
        </div>
      )}
    </div>
  )
}
