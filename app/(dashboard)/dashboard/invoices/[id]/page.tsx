import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { ArrowLeft } from 'lucide-react'
import type { Invoice, InvoiceLineItem, Profile } from '@/lib/types/database'
import { InvoiceDetail } from '@/components/dashboard/invoices/invoice-detail'

export const dynamic = 'force-dynamic'

export default async function InvoiceDetailPage({
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

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()
  const role = (profile as Profile | null)?.role
  if (role !== 'admin' && role !== 'office') redirect('/dashboard')

  const { data: invoice } = await supabase
    .from('invoices')
    .select('*, billing_account:billing_accounts(name), client:clients(name)')
    .eq('id', id)
    .maybeSingle()

  if (!invoice) notFound()

  const { data: lines } = await supabase
    .from('invoice_line_items')
    .select('*')
    .eq('invoice_id', id)
    .order('sort_order', { ascending: true })

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2 h-8 text-muted-foreground">
        <Link href="/dashboard/invoices">
          <ArrowLeft className="mr-1.5 h-4 w-4" />
          Back to invoices
        </Link>
      </Button>

      <InvoiceDetail
        invoice={invoice as unknown as Invoice & {
          billing_account: { name: string } | null
          client: { name: string } | null
        }}
        lines={(lines ?? []) as InvoiceLineItem[]}
      />
    </div>
  )
}
