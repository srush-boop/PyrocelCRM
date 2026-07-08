import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getPurchaseOrder } from '@/lib/jobs/purchasing'
import { getProductSuppliers } from '@/lib/stock'
import { PurchaseOrderDetail } from '@/components/dashboard/purchasing/purchase-order-detail'
import type { Profile } from '@/lib/types/database'

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data } = await supabase.from('purchase_orders').select('po_number').eq('id', id).maybeSingle()
  const label = (data as { po_number?: string } | null)?.po_number ?? 'Purchase order'
  return { title: `${label} | Pyrocel`, description: 'Purchase order detail.' }
}

export default async function PurchaseOrderPage({ params }: { params: Promise<{ id: string }> }) {
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

  const [po, suppliers] = await Promise.all([getPurchaseOrder(supabase, id), getProductSuppliers()])
  if (!po) notFound()

  return <PurchaseOrderDetail po={po} suppliers={suppliers} />
}
