import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import type { Profile } from '@/lib/types/database'
import { NotificationsList } from '@/components/dashboard/notifications/notifications-list'
import { NotificationComposer } from '@/components/dashboard/notifications/notification-composer'

export const dynamic = 'force-dynamic'

export default async function NotificationsPage() {
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
  if (!profile) redirect('/dashboard')

  const role = (profile as Profile).role
  const canCompose = role === 'admin' || role === 'office'

  const { data: notifications } = await supabase
    .from('notifications')
    .select('id, title, body, url, category, read_at, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(100)

  // For the composer's recipient picker (staff only).
  let staff: Pick<Profile, 'id' | 'full_name' | 'email' | 'role'>[] = []
  if (canCompose) {
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name, email, role')
      .in('role', ['admin', 'office', 'engineer'])
      .order('full_name')
    staff = (data as typeof staff) ?? []
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Notifications</h1>
        <p className="text-muted-foreground">
          {canCompose
            ? 'View your notifications and send announcements to users or groups.'
            : 'Your recent notifications.'}
        </p>
      </div>

      {canCompose && <NotificationComposer staff={staff} />}

      <NotificationsList initialNotifications={notifications ?? []} />
    </div>
  )
}
