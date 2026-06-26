import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { ArrowLeft } from 'lucide-react'
import { DirectCostsManager } from '@/components/dashboard/sales/direct-costs-manager'
import type { DirectCost, Profile } from '@/lib/types/database'

export const metadata = { title: 'Direct Costs | Pyrocel' }

export default async function DirectCostsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  if (!profile || !['admin', 'office'].includes((profile as Profile).role)) {
    redirect('/dashboard')
  }

  const { data: costs } = await supabase
    .from('direct_costs')
    .select('*')
    .order('role')

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2">
        <Button variant="ghost" size="sm" className="w-fit -ml-2" asChild>
          <Link href="/dashboard/sales">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Sales
          </Link>
        </Button>
        <h1 className="text-3xl font-bold tracking-tight">Direct Costs</h1>
        <p className="text-muted-foreground">
          Hourly cost of each role. These underpin labour estimates when pricing work.
        </p>
      </div>

      <DirectCostsManager costs={(costs ?? []) as DirectCost[]} />
    </div>
  )
}
