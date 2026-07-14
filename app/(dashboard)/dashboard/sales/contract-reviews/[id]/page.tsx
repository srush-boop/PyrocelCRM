import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import { ContractReviewDetail } from '@/components/dashboard/sales/contract-review-detail'
import type {
  Profile,
  ContractReview,
  ContractReviewItem,
  Quote,
} from '@/lib/types/database'

export const metadata = {
  title: 'Contract Review | Pyrocel',
}

export default async function ContractReviewDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  if (!profile || !['admin', 'office'].includes((profile as Profile).role)) {
    redirect('/dashboard')
  }

  const { data: review } = await supabase
    .from('contract_reviews')
    .select('*, quote:quotes(*)')
    .eq('id', id)
    .maybeSingle()
  if (!review) notFound()

  const { data: items } = await supabase
    .from('contract_review_items')
    .select('*')
    .eq('review_id', id)
    .order('position')

  // Reference data for the pickers/selects.
  const [
    clientsRes,
    sitesRes,
    systemTypesRes,
    serviceTypesRes,
    subsRes,
    siteSystemsRes,
    siteServicesRes,
    branchesRes,
    propertyTypesRes,
    nominalCodesRes,
  ] = await Promise.all([
    supabase.from('clients').select('id, name').order('name'),
    supabase.from('sites').select('id, name, postcode, client_id').order('name'),
    supabase.from('system_types').select('id, name').order('name'),
    supabase.from('service_types').select('id, name').order('name'),
    supabase
      .from('suppliers')
      .select('id, name')
      .eq('supplier_type', 'subcontractor')
      .order('name'),
    supabase.from('site_systems').select('id, name, site_id, system_type_id').order('name'),
    supabase.from('site_services').select('id, site_id, site_system_id, service_type_id'),
    supabase.from('branches').select('id, name').order('name'),
    supabase.from('property_types').select('id, name').eq('active', true).order('name'),
    supabase.from('nominal_codes').select('id, code, name').eq('active', true).order('code'),
  ])

  return (
    <ContractReviewDetail
      review={review as unknown as ContractReview}
      quote={(review as { quote: Quote }).quote}
      items={(items ?? []) as ContractReviewItem[]}
      clients={(clientsRes.data ?? []) as { id: string; name: string }[]}
      sites={
        (sitesRes.data ?? []) as { id: string; name: string; postcode: string | null; client_id: string | null }[]
      }
      systemTypes={(systemTypesRes.data ?? []) as { id: string; name: string }[]}
      serviceTypes={(serviceTypesRes.data ?? []) as { id: string; name: string }[]}
      subcontractors={(subsRes.data ?? []) as { id: string; name: string }[]}
      siteSystems={
        (siteSystemsRes.data ?? []) as { id: string; name: string; site_id: string; system_type_id: string | null }[]
      }
      siteServices={
        (siteServicesRes.data ?? []) as {
          id: string
          site_id: string
          site_system_id: string | null
          service_type_id: string
        }[]
      }
      branches={(branchesRes.data ?? []) as { id: string; name: string }[]}
      propertyTypes={(propertyTypesRes.data ?? []) as { id: string; name: string }[]}
      nominalCodes={
        (nominalCodesRes.data ?? []) as { id: string; code: string; name: string }[]
      }
    />
  )
}
