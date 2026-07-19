import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ReceiptText, Plus, ArrowRight, RefreshCw, TrendingUp } from 'lucide-react'
import type { Invoice, Profile } from '@/lib/types/database'
import { getReadyToInvoiceGroups } from '@/lib/actions/invoices'
import { profileCanEditInvoices } from '@/lib/auth/invoices'
import { InvoicesTable } from '@/components/dashboard/invoices/invoices-table'

export const dynamic = 'force-dynamic'

// The invoices workspace: CRM-owned invoices built from reviewed chargeable
// calls. Office/admin only.
export default async function InvoicesPage() {
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

  const [{ data: invoices }, readyGroups] = await Promise.all([
    supabase
      .from('invoices')
      .select(
        'id, invoice_number, status, financial_year, total_pence, issue_date, due_date, created_at, bill_to_name, bill_to_email, document_type, sent_at, site:sites(name), billing_account:billing_accounts(name), client:clients(name)',
      )
      .order('created_at', { ascending: false })
      .limit(500),
    getReadyToInvoiceGroups(),
  ])

  const readyCount = readyGroups.reduce((s, g) => s + g.tasks.length, 0)
  const canEdit = profileCanEditInvoices(profile as Profile)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Invoices</h1>
          <p className="text-muted-foreground">
            Raise invoices from reviewed chargeable calls, then track them to paid.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline">
            <Link href="/dashboard/invoices/projected-revenue">
              <TrendingUp className="mr-2 h-4 w-4" />
              Projected revenue
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/dashboard/invoices/renewals">
              <RefreshCw className="mr-2 h-4 w-4" />
              Renewals
            </Link>
          </Button>
          <Button asChild>
            <Link href="/dashboard/invoices/new">
              <Plus className="mr-2 h-4 w-4" />
              New invoice
            </Link>
          </Button>
        </div>
      </div>

      {readyCount > 0 && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                <ReceiptText className="h-5 w-5" />
              </span>
              <div>
                <p className="font-medium">
                  {readyCount} call{readyCount === 1 ? '' : 's'} ready to invoice
                </p>
                <p className="text-sm text-muted-foreground">
                  Across {readyGroups.length} billing account
                  {readyGroups.length === 1 ? '' : 's'}.
                </p>
              </div>
            </div>
            <Button asChild variant="outline">
              <Link href="/dashboard/invoices/new">
                Review &amp; raise
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}

      <InvoicesTable
        invoices={(invoices ?? []) as unknown as InvoiceRow[]}
        canEdit={canEdit}
      />
    </div>
  )
}

// Shape the table renders (a trimmed Invoice plus embedded names).
export interface InvoiceRow
  extends Pick<
    Invoice,
    | 'id'
    | 'invoice_number'
    | 'status'
    | 'financial_year'
    | 'total_pence'
    | 'issue_date'
    | 'due_date'
    | 'created_at'
    | 'bill_to_name'
    | 'bill_to_email'
    | 'document_type'
    | 'sent_at'
  > {
  site: { name: string } | null
  billing_account: { name: string } | null
  client: { name: string } | null
}
