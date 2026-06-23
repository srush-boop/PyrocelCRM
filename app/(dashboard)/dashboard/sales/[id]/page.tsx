import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import { QuoteBuilder } from '@/components/dashboard/sales/quote-builder'
import { QuoteStatusPanel } from '@/components/dashboard/sales/quote-status-panel'
import type {
  Client,
  Profile,
  Quote,
  QuoteCatalogueItem,
  QuoteLineItem,
  QuoteSection,
  ServiceType,
  Site,
} from '@/lib/types/database'

export default async function QuoteDetailPage({
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

  const { data: quote } = await supabase
    .from('quotes')
    .select('*, client:clients(id, name), site:sites(id, name)')
    .eq('id', id)
    .single()
  if (!quote) notFound()

  const [{ data: sections }, { data: lines }, { data: clients }, { data: sites }, { data: serviceTypes }, { data: catalogue }] =
    await Promise.all([
      supabase.from('quote_sections').select('*').eq('quote_id', id).order('position'),
      supabase.from('quote_line_items').select('*').eq('quote_id', id).order('position'),
      supabase.from('clients').select('id, name').order('name'),
      supabase.from('sites').select('id, name, client_id').order('name'),
      supabase.from('service_types').select('id, name').eq('status', 'live').order('name'),
      supabase.from('quote_catalogue_items').select('*').eq('active', true).order('name'),
    ])

  const typedQuote = quote as Quote
  const editable = typedQuote.status === 'draft'

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">{typedQuote.title}</h1>
        <p className="text-muted-foreground">
          {typedQuote.quote_number ?? 'Draft'} ·{' '}
          {typedQuote.client?.name ?? typedQuote.prospect_name ?? 'No client'}
        </p>
      </div>

      <QuoteStatusPanel quote={typedQuote} />

      <QuoteBuilder
        clients={(clients ?? []) as Client[]}
        sites={(sites ?? []) as Site[]}
        serviceTypes={(serviceTypes ?? []) as ServiceType[]}
        catalogue={(catalogue ?? []) as QuoteCatalogueItem[]}
        quote={typedQuote}
        initialSections={(sections ?? []) as QuoteSection[]}
        initialLines={(lines ?? []) as QuoteLineItem[]}
        readOnly={!editable}
      />
    </div>
  )
}
