import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { ArrowLeft } from 'lucide-react'
import type { Profile } from '@/lib/types/database'
import {
  getRecognisedRevenue,
  getRecognitionYears,
  type RecognitionSource,
} from '@/lib/actions/recognised-revenue'
import { RecognisedRevenueView } from '@/components/dashboard/invoices/recognised-revenue-view'

export const dynamic = 'force-dynamic'

export default async function RecognisedRevenuePage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; source?: string }>
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  const role = (profile as Pick<Profile, 'role'> | null)?.role
  if (role !== 'admin' && role !== 'office') redirect('/dashboard')

  const sp = await searchParams
  const parsedYear = Number(sp.year)
  const year = Number.isInteger(parsedYear) && parsedYear > 2000 ? parsedYear : new Date().getFullYear()
  const source: RecognitionSource = sp.source === 'issued' ? 'issued' : 'sage'

  const [data, years] = await Promise.all([getRecognisedRevenue(year, source), getRecognitionYears()])

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <Button asChild variant="ghost" size="sm" className="-ml-2 h-8 text-muted-foreground">
          <Link href="/dashboard/invoices">
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            Back to invoices
          </Link>
        </Button>
        <h1 className="text-3xl font-bold tracking-tight text-balance">Recognised recurring revenue</h1>
        <p className="max-w-3xl text-pretty text-muted-foreground">
          The real monthly value of recurring service revenue: only invoice lines on nominal
          code 2107 (Annual Maintenance) are included. Each line is spread across the months it
          covers from its invoice date (annual 1/12, bi-annual 1/6, quarterly 1/3); monthly,
          per-visit and on-completion charges count in full. Credit notes are deducted the same
          way. Figures are ex-VAT.
        </p>
      </div>

      <RecognisedRevenueView data={data} years={years.includes(year) ? years : [year, ...years]} source={source} />
    </div>
  )
}
