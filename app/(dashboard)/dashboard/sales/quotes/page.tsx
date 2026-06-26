import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { QuotesTable } from '@/components/dashboard/sales/quotes-table'
import type { Profile, Quote } from '@/lib/types/database'

export const metadata = {
  title: 'Quotes | Pyrocel',
  description: 'Create and manage quotes across the fire & security portfolio.',
}

export default async function QuotesPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  if (!profile || !['admin', 'office'].includes((profile as Profile).role)) {
    redirect('/dashboard')
  }

  const { data: quotes } = await supabase
    .from('quotes')
    .select('*, client:clients(id, name), site:sites(id, name), preparer:profiles!quotes_created_by_fkey(id, full_name)')
    .order('created_at', { ascending: false })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Quotes</h1>
        <p className="text-muted-foreground">
          Quote supply, installation, commissioning, remedial work and service contracts.
        </p>
      </div>

      <QuotesTable quotes={(quotes ?? []) as Quote[]} />
    </div>
  )
}
