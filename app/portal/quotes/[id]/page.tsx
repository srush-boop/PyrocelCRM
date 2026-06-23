import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { QuoteDocument } from '@/components/dashboard/sales/quote-document'
import { PortalQuoteActions } from '@/components/portal/portal-quote-actions'
import type {
  CompanyInfo,
  Quote,
  QuoteLineItem,
  QuoteSection,
} from '@/lib/types/database'

export default async function PortalQuoteDetailPage({
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

  // RLS ensures the client can only read quotes for their permitted sites.
  const { data: quote } = await supabase
    .from('quotes')
    .select('*, client:clients(*), site:sites(*)')
    .eq('id', id)
    .single()
  if (!quote) notFound()

  const [{ data: sections }, { data: lines }, { data: company }] = await Promise.all([
    supabase.from('quote_sections').select('*').eq('quote_id', id).order('position'),
    supabase.from('quote_line_items').select('*').eq('quote_id', id).order('position'),
    supabase.from('company_info').select('*').limit(1).maybeSingle(),
  ])

  const typedQuote = quote as Quote

  return (
    <div className="space-y-6">
      <PortalQuoteActions quote={typedQuote} />
      <QuoteDocument
        quote={typedQuote}
        sections={(sections ?? []) as QuoteSection[]}
        lines={(lines ?? []) as QuoteLineItem[]}
        company={(company ?? null) as CompanyInfo | null}
        backHref="/portal/quotes"
      />
    </div>
  )
}
