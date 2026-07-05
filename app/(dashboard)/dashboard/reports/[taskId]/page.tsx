import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import { ServiceReport } from '@/components/dashboard/reports/service-report'
import type {
  TaskWithDetails,
  TaskResult,
  ReportTemplate,
  CompanyInfo,
} from '@/lib/types/database'

interface PageProps {
  params: Promise<{ taskId: string }>
}

export default async function ServiceReportPage({ params }: PageProps) {
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
       assigned_engineer:profiles(*, role_ref:roles(*)),
       visit_type:service_visit_types(*)`,
    )
    .eq('id', taskId)
    .single()

  if (!task) notFound()

  const serviceTypeId = task.site_service?.service_type_id

  const [{ data: resultData }, { data: templateData }, { data: companyData }] = await Promise.all([
    supabase.from('task_results').select('*').eq('task_id', taskId).maybeSingle(),
    supabase
      .from('report_templates')
      .select('*')
      .eq('service_type_id', serviceTypeId)
      .maybeSingle(),
    supabase.from('company_info').select('*').limit(1).maybeSingle(),
  ])

  return (
    <ServiceReport
      task={task as TaskWithDetails}
      result={(resultData as TaskResult | null) ?? null}
      template={(templateData as ReportTemplate | null) ?? null}
      companyInfo={(companyData as CompanyInfo | null) ?? null}
    />
  )
}
