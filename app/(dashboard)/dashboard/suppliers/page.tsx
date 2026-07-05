import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { SuppliersTable } from '@/components/dashboard/suppliers/suppliers-table'
import { AddSupplierDialog } from '@/components/dashboard/suppliers/add-supplier-dialog'
import type { Profile, ServiceType, Supplier } from '@/lib/types/database'

export const metadata = { title: 'Suppliers | Pyrocel' }

export default async function SuppliersPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()

  if (!profile || (profile as Profile).role === 'engineer') {
    redirect('/dashboard')
  }

  const [{ data: supplierData }, { data: serviceData }, { data: links }] = await Promise.all([
    supabase.from('suppliers').select('*').order('name'),
    supabase.from('service_types').select('id, name').order('name'),
    supabase.from('supplier_services').select('supplier_id, service_type_id'),
  ])

  // Attach each sub-contractor's provided service ids.
  const serviceIdsBySupplier = new Map<string, string[]>()
  for (const link of (links ?? []) as { supplier_id: string; service_type_id: string }[]) {
    const list = serviceIdsBySupplier.get(link.supplier_id) ?? []
    list.push(link.service_type_id)
    serviceIdsBySupplier.set(link.supplier_id, list)
  }

  const suppliers = ((supplierData ?? []) as Supplier[]).map((s) => ({
    ...s,
    service_type_ids: serviceIdsBySupplier.get(s.id) ?? [],
  }))
  const serviceTypes = (serviceData ?? []) as Pick<ServiceType, 'id' | 'name'>[]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Suppliers</h1>
          <p className="text-muted-foreground">
            Manage product suppliers you order from and sub-contractors who carry out work
          </p>
        </div>
        <AddSupplierDialog serviceTypes={serviceTypes} />
      </div>

      <SuppliersTable suppliers={suppliers} serviceTypes={serviceTypes} />
    </div>
  )
}
