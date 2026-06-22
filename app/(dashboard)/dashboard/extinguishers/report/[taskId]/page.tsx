import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import { ExtinguisherReport } from '@/components/dashboard/extinguishers/extinguisher-report'
import type {
  Profile,
  TaskWithDetails,
  ExtinguisherInspection,
  Extinguisher,
  ReportTemplate,
  CompanyInfo,
} from '@/lib/types/database'

interface PageProps {
  params: Promise<{ taskId: string }>
}

export default async function ExtinguisherReportPage({ params }: PageProps) {
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
       assigned_engineer:profiles(*)`,
    )
    .eq('id', taskId)
    .single()

  if (!task) notFound()

  const serviceTypeId = task.site_service?.service_type_id

  const [{ data: inspectionsData }, { data: templateData }, { data: resultData }, { data: companyData }] =
    await Promise.all([
      supabase
        .from('extinguisher_inspections')
        .select('*, extinguisher:extinguishers(*)')
        .eq('task_id', taskId)
        .order('inspection_date', { ascending: false }),
      supabase.from('report_templates').select('*').eq('service_type_id', serviceTypeId).maybeSingle(),
      supabase.from('task_results').select('reference_number').eq('task_id', taskId).maybeSingle(),
      supabase.from('company_info').select('*').limit(1).maybeSingle(),
    ])

  const inspections = (inspectionsData || []) as (ExtinguisherInspection & {
    extinguisher: Extinguisher | null
  })[]

  return (
    <ExtinguisherReport
      task={task as TaskWithDetails}
      inspections={inspections}
      template={(templateData as ReportTemplate | null) ?? null}
      referenceNumber={resultData?.reference_number ?? null}
      companyInfo={(companyData as CompanyInfo | null) ?? null}
    />
  )
}
