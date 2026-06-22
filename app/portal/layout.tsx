import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { PortalHeader } from '@/components/portal/portal-header'
import type { Profile } from '@/lib/types/database'

export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*, clients(name)')
    .eq('id', user.id)
    .single()

  if (!profile) redirect('/auth/login')

  // Only client logins use the portal; staff belong in the dashboard.
  if ((profile as Profile).role !== 'client') {
    redirect('/dashboard')
  }

  const clientName = (profile as any).clients?.name ?? null

  return (
    <div className="flex min-h-svh flex-col bg-muted/30">
      <PortalHeader clientName={clientName} userName={(profile as Profile).full_name} />
      <main className="mx-auto w-full max-w-6xl flex-1 p-4 md:p-6">{children}</main>
    </div>
  )
}
