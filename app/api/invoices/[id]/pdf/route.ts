import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { renderInvoicePdfBuffer } from '@/lib/pdf/invoice-pdf'
import { resolveInvoiceLineSites } from '@/lib/billing/invoice-line-sites'
import { resolveBillToAddress } from '@/lib/billing/invoice-bill-to'
import type { CompanyInfo, Invoice, InvoiceLineItem, Profile } from '@/lib/types/database'

export const dynamic = 'force-dynamic'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return new NextResponse('Unauthorized', { status: 401 })

  // Only staff may generate the customer copy.
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  const role = (profile as Pick<Profile, 'role'> | null)?.role
  if (role !== 'admin' && role !== 'office') {
    return new NextResponse('Forbidden', { status: 403 })
  }

  const { data: invoice } = await supabase
    .from('invoices')
    .select('*, billing_account:billing_accounts(name)')
    .eq('id', id)
    .maybeSingle()
  if (!invoice) return new NextResponse('Not found', { status: 404 })

  const [{ data: lines }, { data: company }] = await Promise.all([
    supabase
      .from('invoice_line_items')
      .select('*')
      .eq('invoice_id', id)
      .order('sort_order', { ascending: true }),
    supabase.from('company_info').select('*').limit(1).maybeSingle(),
  ])

  const lineList = (lines ?? []) as InvoiceLineItem[]
  const siteByLineId = await resolveInvoiceLineSites(supabase, lineList)
  const typedInvoice = invoice as unknown as Invoice & {
    billing_account: { name: string } | null
  }
  // Fall back to the client's address when the billing-account snapshot is blank.
  const billToAddress = await resolveBillToAddress(supabase, typedInvoice)

  const buffer = await renderInvoicePdfBuffer({
    invoice: { ...typedInvoice, bill_to_address: billToAddress },
    lines: lineList,
    company: (company ?? null) as CompanyInfo | null,
    siteByLineId,
  })

  const safeNumber = String(invoice.invoice_number).replace(/[^a-zA-Z0-9-_]/g, '')
  return new NextResponse(buffer as unknown as BodyInit, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${safeNumber}.pdf"`,
    },
  })
}
