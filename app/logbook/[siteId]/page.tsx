import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { hasLogbookAccess, getPublicLogbook } from './actions'
import { LogbookUnlock } from '@/components/logbook/logbook-unlock'
import { PublicLogbook } from '@/components/logbook/public-logbook'

export const dynamic = 'force-dynamic'

export default async function PublicLogbookPage({
  params,
}: {
  params: Promise<{ siteId: string }>
}) {
  const { siteId } = await params

  // Confirm the site exists (without exposing the postcode).
  const admin = createAdminClient()
  const { data: site } = await admin
    .from('sites')
    .select('id, name')
    .eq('id', siteId)
    .single()

  if (!site) notFound()

  const unlocked = await hasLogbookAccess(siteId)

  if (!unlocked) {
    return <LogbookUnlock siteId={siteId} siteName={site.name} />
  }

  const data = await getPublicLogbook(siteId)
  if (!data) {
    return <LogbookUnlock siteId={siteId} siteName={site.name} />
  }

  return <PublicLogbook data={data} />
}
