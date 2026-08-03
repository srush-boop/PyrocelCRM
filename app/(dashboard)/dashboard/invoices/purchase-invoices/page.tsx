import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import type { Profile, PurchaseInvoice } from '@/lib/types/database'
import { PurchaseInvoicesView } from '@/components/dashboard/purchase-invoices/purchase-invoices-view'

export const dynamic = 'force-dynamic'

// Purchase (supplier) invoices workspace: a document store with an
// approval-for-payment workflow. Admin/office only.
export default async function PurchaseInvoicesPage() {
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

  const [
    { data: invoices },
    { data: sites },
    { data: clients },
    { data: suppliers },
    { data: branches },
    { data: nominalCodes },
    { data: departments },
    { data: authorisers },
    { data: tasks },
    { data: jobs },
  ] = await Promise.all([
    supabase
      .from('purchase_invoices')
      .select(
        '*, site:sites(id, name, postcode), client:clients(id, name), supplier:suppliers(id, name), branch:branches(id, name), nominal_code:nominal_codes(id, code, name), department:departments(id, name), task:tasks(id, reference_number), job:jobs(id, job_number, title), authoriser:profiles!purchase_invoices_authoriser_id_fkey(id, full_name), uploader:profiles!purchase_invoices_uploaded_by_fkey(id, full_name), decider:profiles!purchase_invoices_decided_by_fkey(id, full_name)',
      )
      .order('created_at', { ascending: false })
      .limit(1000),
    supabase.from('sites').select('id, name, postcode').order('name'),
    supabase.from('clients').select('id, name').order('name'),
    supabase.from('suppliers').select('id, name').order('name'),
    supabase.from('branches').select('id, name').order('name'),
    supabase.from('nominal_codes').select('id, code, name').order('code'),
    supabase.from('departments').select('id, name').order('name'),
    supabase
      .from('profiles')
      .select('id, full_name, role')
      .in('role', ['admin', 'office'])
      .order('full_name'),
    supabase
      .from('tasks')
      .select('id, reference_number, site_id')
      .not('reference_number', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1000),
    supabase
      .from('jobs')
      .select('id, job_number, title')
      .order('created_at', { ascending: false })
      .limit(1000),
  ])

  return (
    <PurchaseInvoicesView
      invoices={(invoices ?? []) as PurchaseInvoice[]}
      currentUserId={user.id}
      currentUserRole={role}
      options={{
        sites: (sites ?? []) as { id: string; name: string; postcode: string | null }[],
        clients: (clients ?? []) as { id: string; name: string }[],
        suppliers: (suppliers ?? []) as { id: string; name: string }[],
        branches: (branches ?? []) as { id: string; name: string }[],
        nominalCodes: (nominalCodes ?? []) as { id: string; code: string; name: string }[],
        departments: (departments ?? []) as { id: string; name: string }[],
        authorisers: (authorisers ?? []) as { id: string; full_name: string | null }[],
        tasks: (tasks ?? []) as { id: string; reference_number: string | null }[],
        jobs: (jobs ?? []) as { id: string; job_number: string | null; title: string | null }[],
      }}
    />
  )
}
