import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import { DamperReport } from '@/components/dashboard/dampers/damper-report'
import { fetchResolvedReportTemplate } from '@/lib/reports/resolve-template'
import type {
  Profile,
  TaskWithDetails,
  DamperInspection,
  Damper,
  CompanyInfo,
} from '@/lib/types/database'

interface PageProps {
  params: Promise<{ taskId: string }>
}

export default async function DamperReportPage({ params }: PageProps) {
  const { taskId } = await params
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
  if (!profile) redirect('/auth/login')

  const { data: task } = await supabase
    .from('tasks')
    .select(
      `*,
       site_service:site_services(*, site:sites(*), service_type:service_types(*)),
       assigned_engineer:profiles!tasks_assigned_engineer_id_fkey(*, role_ref:roles(*))`,
    )
    .eq('id', taskId)
    .single()

  if (!task) notFound()

  const serviceTypeId = task.site_service?.service_type_id

  const [{ data: inspectionsData }, template, { data: resultData }, { data: companyData }] =
    await Promise.all([
      supabase
        .from('damper_inspections')
        .select('*, damper:dampers(*)')
        .eq('task_id', taskId)
        .order('inspection_date', { ascending: false }),
      fetchResolvedReportTemplate(supabase, serviceTypeId),
      supabase.from('task_results').select('reference_number').eq('task_id', taskId).maybeSingle(),
      supabase.from('company_info').select('*').limit(1).maybeSingle(),
    ])

  const inspections = (inspectionsData || []) as (DamperInspection & { damper: Damper | null })[]

  return (
    <DamperReport
      task={task as TaskWithDetails}
      inspections={inspections}
      template={template}
      referenceNumber={resultData?.reference_number ?? null}
      companyInfo={(companyData as CompanyInfo | null) ?? null}
    />
  )
}
