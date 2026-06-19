import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import { DamperAsset } from '@/components/dashboard/dampers/damper-asset'
import type { Profile, Damper, DamperInspection, Site } from '@/lib/types/database'

interface PageProps {
  params: Promise<{ urn: string }>
}

export default async function DamperAssetPage({ params }: PageProps) {
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

  const { data: damper } = await supabase
    .from('dampers')
    .select('*, site:sites(*)')
    .eq('urn', decodeURIComponent(urn))
    .maybeSingle()

  if (!damper) notFound()

  const { data: inspections } = await supabase
    .from('damper_inspections')
    .select('*, inspector:profiles(*)')
    .eq('damper_id', (damper as Damper).id)
    .order('inspection_date', { ascending: false })

  return (
    <DamperAsset
      damper={damper as Damper & { site: Site | null }}
      inspections={(inspections || []) as (DamperInspection & { inspector: Profile | null })[]}
      role={(profile as Profile).role}
    />
  )
}
