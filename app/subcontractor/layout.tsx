import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { SubcontractorHeader } from '@/components/subcontractor/subcontractor-header'
import { getAalState } from '@/lib/auth/mfa'
import type { Profile } from '@/lib/types/database'

export default async function SubcontractorLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  // profiles has TWO FKs to suppliers (supplier_id + a legacy subcontractor_id),
  // so the embed must name the constraint or PostgREST returns 300 (ambiguous).
  const { data: profile } = await supabase
    .from('profiles')
    .select('*, supplier:suppliers!profiles_supplier_id_fkey(name)')
    .eq('id', user.id)
    .single()

  if (!profile) redirect('/auth/login')

  // Only activated accounts may use the app.
  if ((profile as Profile).status !== 'active') {
    redirect('/auth/login?error=account-inactive')
  }

  // Only subcontractor logins use this portal; everyone else goes elsewhere.
  if ((profile as Profile).role !== 'subcontractor') {
    redirect('/dashboard')
  }

  // If the subcontractor has opted into MFA, they must complete the challenge.
  const aal = await getAalState(supabase)
  if (aal.needsChallenge) {
    redirect('/auth/mfa')
  }

  const companyName = (profile as any).supplier?.name ?? null

  return (
    <div className="flex min-h-svh flex-col bg-muted/30">
      <SubcontractorHeader
        companyName={companyName}
        userName={(profile as Profile).full_name}
        isLead={(profile as Profile).is_subcontractor_lead === true}
      />
      <main className="mx-auto w-full max-w-6xl flex-1 p-4 md:p-6">{children}</main>
    </div>
  )
}
