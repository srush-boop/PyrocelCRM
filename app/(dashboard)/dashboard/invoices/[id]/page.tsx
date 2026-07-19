import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { ArrowLeft } from 'lucide-react'
import type { Invoice, InvoiceLineItem, NominalCode, Profile } from '@/lib/types/database'
import { InvoiceDetail } from '@/components/dashboard/invoices/invoice-detail'
import { profileCanEditInvoices } from '@/lib/auth/invoices'

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

  // Managed nominal codes for the internal per-line accounting picker.
  const { data: nominalCodeRows } = await supabase
    .from('nominal_codes')
    .select('*')
    .order('code', { ascending: true })
  const nominalCodes = (nominalCodeRows ?? []) as NominalCode[]

  // Resolve each task-sourced line's service type so the detail can group
  // multi-service invoices under service-type subheadings (presentation only).
  const lineList = (lines ?? []) as InvoiceLineItem[]
  const taskIds = Array.from(
    new Set(lineList.map((l) => l.task_id).filter((t): t is string => !!t)),
  )
  const serviceTypeByLineId: Record<string, string> = {}
  if (taskIds.length > 0) {
    const { data: taskRows } = await supabase
      .from('tasks')
      .select('id, site_service:site_services(service_type:service_types(name))')
      .in('id', taskIds)
    const nameByTask = new Map<string, string>()
    for (const t of (taskRows ?? []) as any[]) {
      const ss = Array.isArray(t.site_service) ? t.site_service[0] : t.site_service
      const name = ss?.service_type?.name
      if (name) nameByTask.set(t.id, name)
    }
    for (const l of lineList) {
      if (l.task_id && nameByTask.has(l.task_id)) {
        serviceTypeByLineId[l.id] = nameByTask.get(l.task_id) as string
      }
    }
  }

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
        lines={lineList}
        serviceTypeByLineId={serviceTypeByLineId}
        nominalCodes={nominalCodes}
        canEdit={profileCanEditInvoices(profile as Profile)}
      />
    </div>
  )
}
