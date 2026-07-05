import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
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

// Public, unguessable-token report view. Anyone with the link (e.g. from the
// completion email) can view the report without logging in. Access is granted
// solely by possession of the random per-report token, so we use the
// service-role client to bypass RLS for this single, scoped lookup.
export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ token: string }>
}

// Basic UUID guard so malformed tokens 404 immediately rather than hitting the DB.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default async function PublicReportPage({ params }: PageProps) {
  const { token } = await params

  if (!UUID_RE.test(token)) notFound()

  const supabase = createAdminClient()

  // Look up the report strictly by its public token.
  const { data: task } = await supabase
    .from('tasks')
    .select(
      `*,
       site_service:site_services(*, site:sites(*), service_type:service_types(*)),
       assigned_engineer:profiles(*, role_ref:roles(*))`,
    )
    .eq('public_token', token)
    .maybeSingle()

  // Only completed reports should be viewable via a shared link.
  if (!task || task.status !== 'completed') notFound()

  const taskId = task.id
  const serviceTypeId = task.site_service?.service_type_id
  const serviceName = task.site_service?.service_type?.name

  const { data: companyData } = await supabase
    .from('company_info')
    .select('*')
    .limit(1)
    .maybeSingle()
  const companyInfo = (companyData as CompanyInfo | null) ?? null

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
      <div className="mx-auto max-w-5xl p-4 sm:p-6">
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
      <div className="mx-auto max-w-5xl p-4 sm:p-6">
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
    <div className="mx-auto max-w-5xl p-4 sm:p-6">
      <ServiceReport
        task={task as TaskWithDetails}
        result={(resultData as TaskResult | null) ?? null}
        template={(templateData as ReportTemplate | null) ?? null}
        companyInfo={companyInfo}
      />
    </div>
  )
}
