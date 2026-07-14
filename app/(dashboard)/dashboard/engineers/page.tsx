import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { EngineersTable } from '@/components/dashboard/engineers/engineers-table'
import { computeLeaveBalances, type LeaveBalance } from '@/lib/leave'
import { canGrantLabourCosts } from '@/lib/auth/labour-costs'
import type { Profile, Department, Branch, Role } from '@/lib/types/database'

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

  const [{ data: users }, { data: departments }, { data: branches }, { data: roles }, leaveMap] =
    await Promise.all([
      supabase
        .from('profiles')
        .select('*, role_ref:roles(*)')
        .neq('role', 'client')
        .order('full_name'),
      supabase.from('departments').select('*').order('name'),
      supabase.from('branches').select('*').order('name'),
      supabase.from('roles').select('*').order('name'),
      computeLeaveBalances(),
    ])

  // Serialise the Map to a plain object for the client component.
  const leaveBalances: Record<string, LeaveBalance> = Object.fromEntries(leaveMap)

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

      <EngineersTable
        users={(users || []) as Profile[]}
        departments={(departments || []) as Department[]}
        branches={(branches || []) as Branch[]}
        roles={(roles || []) as Role[]}
        leaveBalances={leaveBalances}
        canGrantLabourCosts={canGrantLabourCosts((profile as Profile).email)}
      />
    </div>
  )
}
