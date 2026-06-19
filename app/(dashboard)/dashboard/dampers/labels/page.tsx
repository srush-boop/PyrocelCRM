import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import type { Damper } from '@/lib/types/database'
import { DamperLabelSheet } from '@/components/dashboard/dampers/damper-label-sheet'

interface PageProps {
  searchParams: Promise<{ site?: string; ids?: string }>
}

export default async function DamperLabelsPage({ searchParams }: PageProps) {
  const { site, ids } = await searchParams
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  let query = supabase.from('dampers').select('*, site:sites(name)')

  if (ids) {
    query = query.in('id', ids.split(',').filter(Boolean))
  } else if (site) {
    query = query.eq('site_id', site)
  } else {
    redirect('/dashboard/dampers')
  }

  const { data } = await query.order('reference', { ascending: true })
  const dampers = (data || []) as (Damper & { site: { name: string } | null })[]

  const siteName = dampers[0]?.site?.name ?? ''

  return <DamperLabelSheet dampers={dampers} siteName={siteName} />
}
