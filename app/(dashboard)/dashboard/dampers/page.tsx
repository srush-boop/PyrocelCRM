import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import type { Profile, Damper } from '@/lib/types/database'
import { DampersIndex } from '@/components/dashboard/dampers/dampers-index'

export default async function DampersPage() {
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
    .from('dampers')
    .select('*, site:sites(id, name)')
    .order('updated_at', { ascending: false })

  const dampers = (data || []) as (Damper & { site: { id: string; name: string } | null })[]

  return <DampersIndex dampers={dampers} />
}
