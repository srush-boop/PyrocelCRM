import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Settings2 } from 'lucide-react'
import { getCalendarData } from '@/lib/calendar'
import { CalendarView } from '@/components/dashboard/calendar/calendar-view'

export default async function CalendarPage() {
  const data = await getCalendarData()
  if (!data) redirect('/auth/login')

  const { items, routes, entryTypes, people, profile, canManageOthers } = data
  const isAdmin = profile.role === 'admin'

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Calendar</h1>
          <p className="text-muted-foreground">
            {canManageOthers
              ? 'Booked service tasks and general entries across the team'
              : 'Your booked tasks and entries shared with you'}
          </p>
        </div>
        {isAdmin && (
          <Button asChild variant="outline">
            <Link href="/dashboard/calendar/types">
              <Settings2 className="mr-2 h-4 w-4" />
              Entry Types
            </Link>
          </Button>
        )}
      </div>

      <CalendarView
        items={items}
        routes={routes}
        entryTypes={entryTypes}
        people={people}
        profile={profile}
        canManageOthers={canManageOthers}
      />
    </div>
  )
}
