import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { HelpContent } from '@/components/dashboard/help/help-content'
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Help &amp; User Manual</h1>
        <p className="text-muted-foreground">
          How to use Pyrocel, tailored to your role
        </p>
      </div>

      <HelpContent role={(profile as Profile).role} />
    </div>
  )
}
