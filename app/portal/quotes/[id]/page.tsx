import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { QuoteDocument } from '@/components/dashboard/sales/quote-document'
import { PortalQuoteActions } from '@/components/portal/portal-quote-actions'
import type {
  CompanyInfo,
  Quote,
  QuoteLineItem,
  QuoteSystem,
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
    .select('*, client:clients(*), site:sites(*), preparer:profiles!quotes_created_by_fkey(id, full_name)')
    .eq('id', id)
    .single()
  if (!quote) notFound()

  const [{ data: systems }, { data: lines }, { data: company }] = await Promise.all([
    supabase.from('quote_systems').select('*').eq('quote_id', id).order('position'),
    supabase.from('quote_line_items').select('*').eq('quote_id', id).order('position'),
    supabase.from('company_info').select('*').limit(1).maybeSingle(),
  ])

  const typedQuote = quote as Quote

  return (
    <div className="space-y-6">
      <PortalQuoteActions quote={typedQuote} />
      <QuoteDocument
        quote={typedQuote}
        systems={(systems ?? []) as QuoteSystem[]}
        lines={(lines ?? []) as QuoteLineItem[]}
        company={(company ?? null) as CompanyInfo | null}
        backHref="/portal/quotes"
      />
    </div>
  )
}
