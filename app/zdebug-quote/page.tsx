import { createAdminClient } from '@/lib/supabase/admin'
import { QuoteDocument } from '@/components/dashboard/sales/quote-document'
import { loadQuoteCatalogue } from '@/lib/sales/equipment-spec'
import type {
  CompanyInfo,
  Quote,
  QuoteLineItem,
  QuoteSystem,
  QuoteRequirement,
} from '@/lib/types/database'

// TEMPORARY debug page — renders the HTML QuoteDocument (the "View / PDF"
// surface) for a quote id via ?id=, bypassing auth to reproduce the crash.
export default async function DebugQuotePage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>
}) {
  const { id } = await searchParams
  if (!id) return <div>missing id</div>
  const supabase = createAdminClient()

  const { data: quote } = await supabase
    .from('quotes')
    .select('*, client:clients(*), site:sites(*), branch:branches(*), preparer:profiles!quotes_created_by_fkey(id, full_name)')
    .eq('id', id)
    .single()
  if (!quote) return <div>quote not found</div>

  const [{ data: systems }, { data: lines }, { data: company }, { data: requirements }] =
    await Promise.all([
      supabase.from('quote_systems').select('*').eq('quote_id', id).order('position'),
      supabase.from('quote_line_items').select('*').eq('quote_id', id).order('position'),
      supabase.from('company_info').select('*').limit(1).maybeSingle(),
      supabase.from('quote_requirements').select('*').eq('quote_id', id).order('position'),
    ])

  const lineRows = (lines ?? []) as QuoteLineItem[]
  const catalogue = (quote as Quote).show_equipment_spec
    ? await loadQuoteCatalogue(supabase, lineRows)
    : []

  return (
    <div className="min-h-screen bg-muted/40 p-4">
      <QuoteDocument
        quote={quote as Quote}
        systems={(systems ?? []) as QuoteSystem[]}
        lines={lineRows}
        company={(company ?? null) as CompanyInfo | null}
        requirements={(requirements ?? []) as QuoteRequirement[]}
        catalogue={catalogue}
      />
    </div>
  )
}
