import { redirect } from 'next/navigation'
import { getMyLeave } from '@/lib/my-leave'
import { MyLeavePanel } from '@/components/dashboard/my-leave/my-leave-panel'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { CalendarDays } from 'lucide-react'

export default async function MyLeavePage() {
  const data = await getMyLeave()
  if (!data) redirect('/auth/login')

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">My Leave</h1>
          <p className="text-muted-foreground">
            Your annual leave balance and request history for this year
          </p>
        </div>
        <Button asChild>
          <Link href="/dashboard/calendar">
            <CalendarDays className="mr-2 h-4 w-4" />
            Request leave
          </Link>
        </Button>
      </div>
      <MyLeavePanel data={data} />
    </div>
  )
}
