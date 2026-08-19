import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { DashboardSidebar } from '@/components/dashboard/sidebar'
import { DashboardHeader } from '@/components/dashboard/header'
import { MobileBottomNav } from '@/components/dashboard/mobile-bottom-nav'
import { SimpleTopBar } from '@/components/dashboard/simple/simple-top-bar'
import { SimpleBottomNav } from '@/components/dashboard/simple/simple-bottom-nav'
import { ViewModeToggle } from '@/components/dashboard/simple/view-mode-toggle'
import { OncallBanner } from '@/components/dashboard/oncall/oncall-banner'
import { LoneWorkerPrompt } from '@/components/dashboard/lone-worker/lone-worker-prompt'
import { OnboardingWizard } from '@/components/dashboard/onboarding/onboarding-wizard'
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar'
import { getAalState, mfaRequiredForRole } from '@/lib/auth/mfa'
import { getSimpleSectionsForUser } from '@/lib/config/simple-app'
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

  // Only activated accounts may use the app. Self-registered/trigger-created
  // rows start 'inactive' until an admin activates them.
  if ((profile as Profile).status !== 'active') {
    redirect('/auth/login?error=account-inactive')
  }

  // Client logins are read-only and belong in the portal, not the staff dashboard.
  if ((profile as Profile).role === 'client') {
    redirect('/portal')
  }

  const role = (profile as Profile).role

  // Multi-factor enforcement:
  //  - Anyone with a verified factor must complete a TOTP challenge (aal2).
  //  - MFA-required roles without any factor are pushed into setup.
  const aal = await getAalState(supabase)
  if (aal.needsChallenge) {
    redirect('/auth/mfa')
  }
  if (mfaRequiredForRole(role) && !aal.hasVerifiedFactor) {
    redirect('/auth/mfa-setup')
  }

  // Forced first-login password change: admin-created accounts start on an
  // admin-set (and possibly emailed) temporary password. Until the user sets
  // their own, keep them on the dedicated change-password screen. Runs after MFA
  // so the change happens inside a fully authenticated (aal2) session.
  if ((profile as Profile).must_change_password) {
    redirect('/auth/change-password')
  }

  // Sub-contractors get the same mobile-first field UI as engineers (bottom
  // nav, extra padding) but a heavily restricted navigation.
  const isEngineer = role === 'engineer' || role === 'subcontractor'

  // Simplified "on-the-go" app: non-engineer office staff get a stripped-back,
  // tap-friendly shell on phone/tablet (<1024px) built from their existing Menu
  // Access. Desktop always shows the full dashboard. A cookie-backed override
  // ("View full site") lets them opt into the full layout on mobile too, read
  // here at SSR so first paint is correct (no flash). The phone-vs-desktop
  // split itself stays pure CSS, matching how the sidebar already responds.
  const simpleSections = isEngineer
    ? []
    : getSimpleSectionsForUser(role, (profile as Profile).menu_permissions)
  const simpleCapable = simpleSections.length > 0
  const cookieStore = await cookies()
  const forcedFull = cookieStore.get('app_view')?.value === 'full'
  const showSimpleChrome = simpleCapable && !forcedFull
  const simpleKeys = simpleSections.map((s) => s.key)

  // First-login walkthrough: shown once for accounts that have never completed
  // (or skipped) it. Office/admin additionally get the dashboard step since only
  // they have a personalisable home dashboard.
  const needsOnboarding = (profile as Profile).onboarded_at == null
  const canPersonaliseDashboard = role === 'admin' || role === 'office'

  return (
    // Sidebar starts expanded by default so the full navigation is visible on load.
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar profile={profile as Profile} />
      <SidebarInset className="h-svh overflow-hidden">
        {/* Simple Mode top bar — mobile only; the full header takes over at lg. */}
        {showSimpleChrome && (
          <div className="lg:hidden">
            <SimpleTopBar profile={profile as Profile} />
          </div>
        )}
        {/* Full header. Hidden on mobile when Simple Mode is active. */}
        <div className={showSimpleChrome ? 'hidden lg:block' : 'contents'}>
          <DashboardHeader profile={profile as Profile} />
        </div>
        <OncallBanner />
        {/* Mobile-only escape hatch back to Simple Mode when a phone user has
            forced the full site. */}
        {simpleCapable && forcedFull && (
          <div className="flex justify-center border-b bg-muted/40 px-4 py-2 lg:hidden">
            <ViewModeToggle mode="to-simple" />
          </div>
        )}
        <main
          className={`flex-1 overflow-y-auto p-4 pb-24 md:p-6 md:pb-24 ${
            isEngineer || showSimpleChrome ? 'pb-28 lg:pb-24' : ''
          }`}
        >
          {children}
        </main>
        {isEngineer && <MobileBottomNav profile={profile as Profile} />}
        {showSimpleChrome && <SimpleBottomNav enabledKeys={simpleKeys} />}
      </SidebarInset>
      <LoneWorkerPrompt />
      {needsOnboarding && (
        <OnboardingWizard
          profile={profile as Profile}
          canPersonaliseDashboard={canPersonaliseDashboard}
        />
      )}
    </SidebarProvider>
  )
}
