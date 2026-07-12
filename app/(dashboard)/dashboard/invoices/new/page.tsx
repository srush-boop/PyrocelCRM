import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { ArrowLeft } from 'lucide-react'
import type { Profile } from '@/lib/types/database'
import { getReadyToInvoiceGroups } from '@/lib/actions/invoices'
import { CreateInvoiceGroups } from '@/components/dashboard/invoices/create-invoice-groups'

export const dynamic = 'force-dynamic'

// Raise invoices from reviewed chargeable calls, grouped by billing account.
export default async function NewInvoicePage() {
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

  const groups = await getReadyToInvoiceGroups()

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <Button asChild variant="ghost" size="sm" className="-ml-2 h-8 text-muted-foreground">
          <Link href="/dashboard/invoices">
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            Back to invoices
          </Link>
        </Button>
        <h1 className="text-3xl font-bold tracking-tight">Raise an invoice</h1>
        <p className="text-muted-foreground">
          Reviewed chargeable calls, grouped by billing account. Pick the calls to
          include and create a draft invoice you can price up before issuing.
        </p>
      </div>

      <CreateInvoiceGroups groups={groups} />
    </div>
  )
}
