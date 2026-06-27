import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { ChevronLeft } from 'lucide-react'
import { EntryTypesManager } from '@/components/dashboard/calendar/entry-types-manager'
import type { Profile, CalendarEntryType } from '@/lib/types/database'

export default async function CalendarEntryTypesPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  // Only admins configure entry types.
  if (!profile || (profile as Profile).role !== 'admin') {
    redirect('/dashboard/calendar')
  }

  const { data: entryTypes } = await supabase
    .from('calendar_entry_types')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })

  return (
    <div className="space-y-6">
      <div>
        <Button asChild variant="ghost" size="sm" className="mb-2 -ml-2">
          <Link href="/dashboard/calendar">
            <ChevronLeft className="mr-1 h-4 w-4" />
            Back to calendar
          </Link>
        </Button>
        <h1 className="text-3xl font-bold tracking-tight">Calendar Entry Types</h1>
        <p className="text-muted-foreground">
          Configure the kinds of general entries staff can add to the calendar, such as
          annual leave, sickness or training.
        </p>
      </div>

      <EntryTypesManager entryTypes={(entryTypes || []) as CalendarEntryType[]} />
    </div>
  )
}
