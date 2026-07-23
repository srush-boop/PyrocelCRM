import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { HelpContent } from '@/components/dashboard/help/help-content'
import { DownloadManualButton } from '@/components/dashboard/help/download-manual-button'
import type { Profile } from '@/lib/types/database'

export default async function HelpPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  if (!profile) redirect('/auth/login')

  const role = (profile as Profile).role
  const roleLabel =
    role === 'admin'
      ? 'Administrator'
      : role === 'office'
        ? 'Office'
        : role === 'subcontractor'
          ? 'Sub-contractor'
          : role === 'client'
            ? 'Client'
            : 'Engineer'

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Help &amp; User Manual</h1>
          <p className="text-muted-foreground">
            How to use Pyrocel, tailored to your role
          </p>
        </div>
        <DownloadManualButton fileName={`Pyrocel-User-Manual-${roleLabel}`} />
      </div>

      <HelpContent role={role} />
    </div>
  )
}
