import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { ArrowLeft } from 'lucide-react'
import type { Profile } from '@/lib/types/database'
import { getRenewalsDue } from '@/lib/actions/recurring-renewals'
import { RenewalsManager } from '@/components/dashboard/invoices/renewals-manager'

export const dynamic = 'force-dynamic'

// Renewals: recurring charges grouped by renewal month, with a bulk price
// increase and a per-account renewal-notice email.
export default async function RenewalsPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>
}) {
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

  const sp = await searchParams
  const parsed = Number(sp.month)
  const month = parsed >= 1 && parsed <= 12 ? parsed : new Date().getMonth() + 1

  const rows = await getRenewalsDue(month)

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <Button asChild variant="ghost" size="sm" className="-ml-2 h-8 text-muted-foreground">
          <Link href="/dashboard/invoices">
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            Back to invoices
          </Link>
        </Button>
        <h1 className="text-3xl font-bold tracking-tight">Renewals</h1>
        <p className="text-muted-foreground">
          Recurring charges due for renewal. Apply price increases before sending each customer
          their proposed pricing for the forthcoming period.
        </p>
      </div>

      <RenewalsManager rows={rows} month={month} />
    </div>
  )
}
