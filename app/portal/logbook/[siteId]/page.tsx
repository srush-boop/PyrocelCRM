import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { PortalLogbook } from '@/components/portal/portal-logbook'
import { getClientLogbook } from '../actions'

export default async function PortalSiteLogbookPage({
  params,
}: {
  params: Promise<{ siteId: string }>
}) {
  const { siteId } = await params

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const data = await getClientLogbook(siteId)
  if (!data) notFound()

  return <PortalLogbook data={data} />
}
