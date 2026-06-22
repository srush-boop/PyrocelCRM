import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import type { Extinguisher } from '@/lib/types/database'
import { ExtinguisherLabelSheet } from '@/components/dashboard/extinguishers/extinguisher-label-sheet'

interface PageProps {
  searchParams: Promise<{ site?: string; ids?: string }>
}

export default async function ExtinguisherLabelsPage({ searchParams }: PageProps) {
  const { site, ids } = await searchParams
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  let query = supabase.from('extinguishers').select('*, site:sites(name)')

  if (ids) {
    query = query.in('id', ids.split(',').filter(Boolean))
  } else if (site) {
    query = query.eq('site_id', site)
  } else {
    redirect('/dashboard/extinguishers')
  }

  const { data } = await query.order('reference', { ascending: true })
  const extinguishers = (data || []) as (Extinguisher & { site: { name: string } | null })[]

  const siteName = extinguishers[0]?.site?.name ?? ''

  return <ExtinguisherLabelSheet extinguishers={extinguishers} siteName={siteName} />
}
