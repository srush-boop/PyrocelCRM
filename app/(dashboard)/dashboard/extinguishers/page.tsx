import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import type { Profile, Extinguisher } from '@/lib/types/database'
import { ExtinguishersIndex } from '@/components/dashboard/extinguishers/extinguishers-index'

export default async function ExtinguishersPage() {
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

  if (!profile || (profile as Profile).role === 'engineer') {
    redirect('/dashboard')
  }

  const { data } = await supabase
    .from('extinguishers')
    .select('*, site:sites(id, name)')
    .order('updated_at', { ascending: false })

  const extinguishers = (data || []) as (Extinguisher & {
    site: { id: string; name: string } | null
  })[]

  return <ExtinguishersIndex extinguishers={extinguishers} />
}
