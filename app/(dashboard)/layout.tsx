import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { DashboardSidebar } from '@/components/dashboard/sidebar'
import { DashboardHeader } from '@/components/dashboard/header'
import { MobileBottomNav } from '@/components/dashboard/mobile-bottom-nav'
import { OncallBanner } from '@/components/dashboard/oncall/oncall-banner'
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar'
import type { Profile } from '@/lib/types/database'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    redirect('/auth/login')
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  if (!profile) {
    redirect('/auth/login')
  }

  // Client logins are read-only and belong in the portal, not the staff dashboard.
  if ((profile as Profile).role === 'client') {
    redirect('/portal')
  }

  const isEngineer = (profile as Profile).role === 'engineer'

  return (
    <SidebarProvider>
      <DashboardSidebar profile={profile as Profile} />
      <SidebarInset className="h-svh overflow-hidden">
        <DashboardHeader profile={profile as Profile} />
        <OncallBanner />
        <main
          className={`flex-1 overflow-y-auto p-4 pb-24 md:p-6 md:pb-24 ${
            isEngineer ? 'pb-28 lg:pb-24' : ''
          }`}
        >
          {children}
        </main>
        {isEngineer && <MobileBottomNav profile={profile as Profile} />}
      </SidebarInset>
    </SidebarProvider>
  )
}
