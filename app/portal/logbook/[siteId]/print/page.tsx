import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getClientLogbook } from '@/app/portal/logbook/actions'
import { LogbookPrintDocument } from '@/components/logbook/logbook-print-document'
import type { CompanyInfo } from '@/lib/types/database'

export const metadata = { title: 'Fire Safety Log Book | Pyrocel' }

export default async function PortalLogbookPrintPage({
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

  // RLS scopes this to the logged-in client's permitted sites.
  const data = await getClientLogbook(siteId)
  if (!data) notFound()

  const { data: company } = await supabase
    .from('company_info')
    .select('name')
    .limit(1)
    .maybeSingle()

  return (
    <div className="min-h-screen bg-muted/40 print:bg-white">
      <LogbookPrintDocument
        site={data.site}
        reports={data.reports}
        entries={data.entries}
        company={(company as Pick<CompanyInfo, 'name'> | null) ?? null}
        backHref={`/portal/logbook/${siteId}`}
      />
    </div>
  )
}
