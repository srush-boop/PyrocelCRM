import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { EngineersTable } from '@/components/dashboard/engineers/engineers-table'
import type { Profile } from '@/lib/types/database'

export default async function EngineersPage() {
  const supabase = await createClient()
  
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  if (!profile || (profile as Profile).role !== 'admin') {
    redirect('/dashboard')
  }

  const { data: users } = await supabase
    .from('profiles')
    .select('*')
    .neq('role', 'client')
    .order('full_name')

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Engineers & Staff</h1>
          <p className="text-muted-foreground">
            Manage team members and their roles
          </p>
        </div>
      </div>

      <EngineersTable users={(users || []) as Profile[]} />
    </div>
  )
}
