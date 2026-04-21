import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { ClientsTable } from '@/components/dashboard/clients/clients-table'
import type { Client, Profile } from '@/lib/types/database'

export default async function ClientsPage() {
  const supabase = await createClient()
  
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  if (!profile || !['admin', 'office'].includes((profile as Profile).role)) {
    redirect('/dashboard')
  }

  const { data: clients } = await supabase
    .from('clients')
    .select('*')
    .order('name')

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Clients</h1>
        <p className="text-muted-foreground">
          Manage client companies and their contact information
        </p>
      </div>

      <ClientsTable clients={(clients || []) as Client[]} />
    </div>
  )
}
