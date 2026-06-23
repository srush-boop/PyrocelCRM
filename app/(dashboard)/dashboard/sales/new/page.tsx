import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { QuoteBuilder } from '@/components/dashboard/sales/quote-builder'
import type { Client, Profile, QuoteCatalogueItem, ServiceType, Site } from '@/lib/types/database'

export const metadata = { title: 'New Quote | Pyrocel' }

export default async function NewQuotePage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  if (!profile || !['admin', 'office'].includes((profile as Profile).role)) {
    redirect('/dashboard')
  }

  const [{ data: clients }, { data: sites }, { data: serviceTypes }, { data: catalogue }] =
    await Promise.all([
      supabase.from('clients').select('id, name').order('name'),
      supabase.from('sites').select('id, name, client_id').order('name'),
      supabase.from('service_types').select('id, name').eq('status', 'live').order('name'),
      supabase
        .from('quote_catalogue_items')
        .select('*')
        .eq('active', true)
        .order('name'),
    ])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">New Quote</h1>
        <p className="text-muted-foreground">Build a quote with grouped sections and line items.</p>
      </div>

      <QuoteBuilder
        clients={(clients ?? []) as Client[]}
        sites={(sites ?? []) as Site[]}
        serviceTypes={(serviceTypes ?? []) as ServiceType[]}
        catalogue={(catalogue ?? []) as QuoteCatalogueItem[]}
      />
    </div>
  )
}
