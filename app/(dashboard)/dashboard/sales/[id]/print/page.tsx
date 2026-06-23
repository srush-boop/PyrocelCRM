import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import { QuoteDocument } from '@/components/dashboard/sales/quote-document'
import type {
  CompanyInfo,
  Profile,
  Quote,
  QuoteLineItem,
  QuoteSection,
} from '@/lib/types/database'

export const metadata = { title: 'Quote | Pyrocel' }

export default async function QuotePrintPage({
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
    .select('*, client:clients(*), site:sites(*)')
    .eq('id', id)
    .single()
  if (!quote) notFound()

  const [{ data: sections }, { data: lines }, { data: company }] = await Promise.all([
    supabase.from('quote_sections').select('*').eq('quote_id', id).order('position'),
    supabase.from('quote_line_items').select('*').eq('quote_id', id).order('position'),
    supabase.from('company_info').select('*').limit(1).maybeSingle(),
  ])

  return (
    <div className="min-h-screen bg-muted/40 p-4 sm:p-8 print:bg-white print:p-0">
      <QuoteDocument
        quote={quote as Quote}
        sections={(sections ?? []) as QuoteSection[]}
        lines={(lines ?? []) as QuoteLineItem[]}
        company={(company ?? null) as CompanyInfo | null}
        backHref={`/dashboard/sales/${id}`}
      />
    </div>
  )
}
