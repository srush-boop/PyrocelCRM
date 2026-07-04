import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { renderQuotePdfBuffer } from '@/lib/pdf/quote-pdf'
import { loadQuoteCatalogue } from '@/lib/sales/equipment-spec'
import type {
  Quote,
  QuoteSystem,
  QuoteLineItem,
  CompanyInfo,
} from '@/lib/types/database'

// TEMPORARY debug route to reproduce the "send quote" PDF failure.
export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'missing id' }, { status: 400 })

  try {
    const supabase = await createClient()
    const { data: quote } = await supabase
      .from('quotes')
      .select(
        '*, client:clients(*), site:sites(*), preparer:profiles!quotes_created_by_fkey(id, full_name)',
      )
      .eq('id', id)
      .single()
    if (!quote) return NextResponse.json({ error: 'quote not found' }, { status: 404 })

    const [{ data: systems }, { data: lines }, { data: company }] = await Promise.all([
      supabase.from('quote_systems').select('*').eq('quote_id', id).order('position'),
      supabase.from('quote_line_items').select('*').eq('quote_id', id).order('position'),
      supabase.from('company_info').select('*').limit(1).maybeSingle(),
    ])

    const typedQuote = quote as Quote
    const typedLines = (lines ?? []) as QuoteLineItem[]
    const catalogue = typedQuote.show_equipment_spec
      ? await loadQuoteCatalogue(supabase, typedLines)
      : []

    const pdf = await renderQuotePdfBuffer({
      quote: typedQuote,
      systems: (systems ?? []) as QuoteSystem[],
      lines: typedLines,
      company: (company ?? null) as CompanyInfo | null,
      catalogue,
    })
    return NextResponse.json({ ok: true, bytes: pdf.length })
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        name: (e as Error)?.name,
        message: (e as Error)?.message,
        stack: (e as Error)?.stack?.split('\n').slice(0, 12),
      },
      { status: 500 },
    )
  }
}
