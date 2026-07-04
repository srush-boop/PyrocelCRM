import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { TrainingManager } from '@/components/dashboard/training/training-manager'
import type { Profile, Department, TrainingRecord } from '@/lib/types/database'

export default async function TrainingPage() {
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

  // Training is HR data — restricted to admin/office.
  if (!profile || !['admin', 'office'].includes((profile as Profile).role)) {
    redirect('/dashboard')
  }

  const [{ data: users }, { data: departments }, { data: records }] = await Promise.all([
    supabase.from('profiles').select('*').neq('role', 'client').order('full_name'),
    supabase.from('departments').select('*').order('name'),
    supabase
      .from('training_records')
      .select('*, profile:profiles!training_records_profile_id_fkey(*)')
      .order('expiry_date', { ascending: true, nullsFirst: false }),
  ])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Training Records</h1>
        <p className="text-muted-foreground">
          Track employee training, bulk upload records, and export anonymised summaries for clients.
        </p>
      </div>

      <TrainingManager
        users={(users || []) as Profile[]}
        departments={(departments || []) as Department[]}
        records={(records || []) as TrainingRecord[]}
      />
    </div>
  )
}
