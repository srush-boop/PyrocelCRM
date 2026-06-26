import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { QuoteBankExplorer } from '@/components/dashboard/sales/quote-bank-explorer'
import type { Profile, QuoteBankValue, SystemType } from '@/lib/types/database'

export const metadata = { title: 'Quote Bank | Pyrocel' }

export default async function QuoteBankPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  if (!profile || !['admin', 'office'].includes((profile as Profile).role)) {
    redirect('/dashboard')
  }

  const [{ data: values }, { data: systemTypes }] = await Promise.all([
    supabase.from('quote_bank_values').select('*').order('created_at', { ascending: false }),
    supabase.from('system_types').select('id, name, code').order('name'),
  ])

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">Quote Bank</h1>
        <p className="text-muted-foreground">
          Historical system values from sent and accepted quotes. Filter by system and work type to
          benchmark your pricing.
        </p>
      </div>

      <QuoteBankExplorer
        values={(values ?? []) as QuoteBankValue[]}
        systemTypes={(systemTypes ?? []) as SystemType[]}
      />
    </div>
  )
}
