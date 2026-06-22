import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import { ExtinguisherAsset } from '@/components/dashboard/extinguishers/extinguisher-asset'
import type { Profile, Extinguisher, ExtinguisherInspection, Site } from '@/lib/types/database'

interface PageProps {
  params: Promise<{ urn: string }>
}

export default async function ExtinguisherAssetPage({ params }: PageProps) {
  const { urn } = await params
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
  if (!profile) redirect('/auth/login')

  const { data: extinguisher } = await supabase
    .from('extinguishers')
    .select('*, site:sites(*)')
    .eq('urn', decodeURIComponent(urn))
    .maybeSingle()

  if (!extinguisher) notFound()

  const { data: inspections } = await supabase
    .from('extinguisher_inspections')
    .select('*, inspector:profiles(*)')
    .eq('extinguisher_id', (extinguisher as Extinguisher).id)
    .order('inspection_date', { ascending: false })

  return (
    <ExtinguisherAsset
      extinguisher={extinguisher as Extinguisher & { site: Site | null }}
      inspections={
        (inspections || []) as (ExtinguisherInspection & { inspector: Profile | null })[]
      }
      role={(profile as Profile).role}
    />
  )
}
