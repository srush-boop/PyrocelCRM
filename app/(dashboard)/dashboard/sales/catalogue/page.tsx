import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { ArrowLeft } from 'lucide-react'
import { CatalogueManager } from '@/components/dashboard/sales/catalogue-manager'
import { ProductSheetPanel } from '@/components/dashboard/sales/product-sheet-panel'
import { fetchAllCatalogueItems } from '@/lib/sales'
import type { Profile, ProductSheet, ServiceType } from '@/lib/types/database'

export const metadata = { title: 'Quote Catalogue | Pyrocel' }

export default async function CataloguePage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  if (!profile || !['admin', 'office'].includes((profile as Profile).role)) {
    redirect('/dashboard')
  }

  const [items, { data: serviceTypes }, { data: currentSheet }] = await Promise.all([
    fetchAllCatalogueItems(supabase),
    supabase.from('service_types').select('id, name').eq('status', 'live').order('name'),
    supabase
      .from('product_sheets')
      .select('*')
      .eq('is_current', true)
      .order('uploaded_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2">
        <Button variant="ghost" size="sm" className="w-fit -ml-2" asChild>
          <Link href="/dashboard/sales">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Sales
          </Link>
        </Button>
        <h1 className="text-3xl font-bold tracking-tight">Quote Catalogue</h1>
        <p className="text-muted-foreground">
          Reusable items and standard prices that can be dropped into any quote.
        </p>
      </div>

      <ProductSheetPanel current={(currentSheet as ProductSheet | null) ?? null} />

      <CatalogueManager
        items={items}
        serviceTypes={(serviceTypes ?? []) as ServiceType[]}
      />
    </div>
  )
}
