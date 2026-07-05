import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { SuppliersTable } from '@/components/dashboard/suppliers/suppliers-table'
import { AddSupplierDialog } from '@/components/dashboard/suppliers/add-supplier-dialog'
import type { Profile, Supplier } from '@/lib/types/database'

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

  const { data } = await supabase.from('suppliers').select('*').order('name')
  const suppliers = (data || []) as Supplier[]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Suppliers</h1>
          <p className="text-muted-foreground">
            Manage the suppliers you order parts and products from
          </p>
        </div>
        <AddSupplierDialog />
      </div>

      <SuppliersTable suppliers={suppliers} />
    </div>
  )
}
