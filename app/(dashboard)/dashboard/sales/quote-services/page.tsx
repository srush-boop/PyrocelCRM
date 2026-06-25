import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { QuoteServicesManager } from '@/components/dashboard/sales/quote-services-manager'
import type { Profile, QuoteService } from '@/lib/types/database'

export const metadata = { title: 'Quote Services | Pyrocel' }

export default async function QuoteServicesPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  if (!profile || !['admin', 'office'].includes((profile as Profile).role)) {
    redirect('/dashboard')
  }

  const { data: services } = await supabase
    .from('quote_services')
    .select('*')
    .order('position')
    .order('name')

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">Quote Services</h1>
        <p className="text-muted-foreground">
          Reusable non-product services (e.g. Installation, Decommission redundant equipment) that
          can be added to any system on a quote. They appear under the &quot;Add service&quot; button
          in the quote builder and are grouped as a Services sub-section on the quote.
        </p>
      </div>
      <QuoteServicesManager services={(services ?? []) as QuoteService[]} />
    </div>
  )
}
