import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { ServiceReport } from '@/components/dashboard/reports/service-report'
import { DamperReport } from '@/components/dashboard/dampers/damper-report'
import { ExtinguisherReport } from '@/components/dashboard/extinguishers/extinguisher-report'
import { isDamperService } from '@/lib/dampers'
import { isExtinguisherService } from '@/lib/extinguishers'
import type {
  TaskWithDetails,
  TaskResult,
  ReportTemplate,
  DamperInspection,
  Damper,
  ExtinguisherInspection,
  Extinguisher,
  CompanyInfo,
} from '@/lib/types/database'

interface PageProps {
  params: Promise<{ taskId: string }>
}

export default async function PortalReportPage({ params }: PageProps) {
  const { taskId } = await params
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  // RLS guarantees this task is only returned if it belongs to a permitted site.
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
  const serviceName = task.site_service?.service_type?.name

  const { data: companyData } = await supabase
    .from('company_info')
    .select('*')
    .limit(1)
    .maybeSingle()
  const companyInfo = (companyData as CompanyInfo | null) ?? null

  const backLink = (
    <Link
      href="/portal"
      className="mb-4 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground print:hidden"
    >
      <ArrowLeft className="h-4 w-4" />
      Back to reports
    </Link>
  )

  if (isDamperService(serviceName)) {
    const [{ data: inspectionsData }, { data: templateData }, { data: resultData }] =
      await Promise.all([
        supabase
          .from('damper_inspections')
          .select('*, damper:dampers(*)')
          .eq('task_id', taskId)
          .order('inspection_date', { ascending: false }),
        supabase.from('report_templates').select('*').eq('service_type_id', serviceTypeId).maybeSingle(),
        supabase.from('task_results').select('reference_number').eq('task_id', taskId).maybeSingle(),
      ])

    return (
      <div>
        {backLink}
        <DamperReport
          task={task as TaskWithDetails}
          inspections={(inspectionsData || []) as (DamperInspection & { damper: Damper | null })[]}
          template={(templateData as ReportTemplate | null) ?? null}
          referenceNumber={resultData?.reference_number ?? null}
          companyInfo={companyInfo}
        />
      </div>
    )
  }

  if (isExtinguisherService(serviceName)) {
    const [{ data: inspectionsData }, { data: templateData }, { data: resultData }] =
      await Promise.all([
        supabase
          .from('extinguisher_inspections')
          .select('*, extinguisher:extinguishers(*)')
          .eq('task_id', taskId)
          .order('inspection_date', { ascending: false }),
        supabase.from('report_templates').select('*').eq('service_type_id', serviceTypeId).maybeSingle(),
        supabase.from('task_results').select('reference_number').eq('task_id', taskId).maybeSingle(),
      ])

    return (
      <div>
        {backLink}
        <ExtinguisherReport
          task={task as TaskWithDetails}
          inspections={
            (inspectionsData || []) as (ExtinguisherInspection & { extinguisher: Extinguisher | null })[]
          }
          template={(templateData as ReportTemplate | null) ?? null}
          referenceNumber={resultData?.reference_number ?? null}
          companyInfo={companyInfo}
        />
      </div>
    )
  }

  // Generic service report (covers fire alarm/MCP, emergency lighting, and others)
  const [{ data: resultData }, { data: templateData }] = await Promise.all([
    supabase.from('task_results').select('*').eq('task_id', taskId).maybeSingle(),
    supabase.from('report_templates').select('*').eq('service_type_id', serviceTypeId).maybeSingle(),
  ])

  return (
    <div>
      {backLink}
      <ServiceReport
        task={task as TaskWithDetails}
        result={(resultData as TaskResult | null) ?? null}
        template={(templateData as ReportTemplate | null) ?? null}
        companyInfo={companyInfo}
      />
    </div>
  )
}
