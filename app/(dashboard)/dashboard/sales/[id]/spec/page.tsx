import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import { EquipmentSpecDocument } from '@/components/dashboard/sales/equipment-spec-document'
import { loadQuoteCatalogue } from '@/lib/sales/equipment-spec'
import type {
  CompanyInfo,
  Profile,
  Quote,
  QuoteLineItem,
  QuoteSystem,
} from '@/lib/types/database'

export const metadata = { title: 'Equipment Specification | Pyrocel' }

export default async function EquipmentSpecPage({
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

  const [{ data: systems }, { data: lines }, { data: company }] = await Promise.all([
    supabase.from('quote_systems').select('*').eq('quote_id', id).order('position'),
    supabase.from('quote_line_items').select('*').eq('quote_id', id).order('position'),
    supabase.from('company_info').select('*').limit(1).maybeSingle(),
  ])

  // Pull the official spec text from the catalogue for the products on this quote
  // (matched by catalogue id, with product code as a fallback).
  const lineRows = (lines ?? []) as QuoteLineItem[]
  const catalogueIds = Array.from(
    new Set(lineRows.map((l) => l.catalogue_item_id).filter(Boolean) as string[]),
  )
  const productCodes = Array.from(
    new Set(lineRows.map((l) => l.product_code).filter(Boolean) as string[]),
  )

  let catalogue: {
    id: string
    product_code: string | null
    name: string
    description: string | null
  }[] = []
  if (catalogueIds.length > 0 || productCodes.length > 0) {
    const filters: string[] = []
    if (catalogueIds.length > 0) filters.push(`id.in.(${catalogueIds.join(',')})`)
    if (productCodes.length > 0) {
      const quoted = productCodes.map((c) => `"${c.replace(/"/g, '')}"`).join(',')
      filters.push(`product_code.in.(${quoted})`)
    }
    const { data: cat } = await supabase
      .from('quote_catalogue_items')
      .select('id, product_code, name, description')
      .or(filters.join(','))
    catalogue = (cat ?? []) as typeof catalogue
  }

  return (
    <div className="min-h-screen bg-muted/40 p-4 sm:p-8 print:bg-white print:p-0">
      <EquipmentSpecDocument
        quote={quote as Quote}
        systems={(systems ?? []) as QuoteSystem[]}
        lines={lineRows}
        catalogue={catalogue}
        company={(company ?? null) as CompanyInfo | null}
        backHref={`/dashboard/sales/${id}`}
      />
    </div>
  )
}
