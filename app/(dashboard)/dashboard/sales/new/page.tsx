import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { QuoteBuilder } from '@/components/dashboard/sales/quote-builder'
import { resolveDefaultMargin } from '@/lib/sales'
import { getFailedChecklistItems, buildRemedialScope } from '@/lib/defects'
import type { ChecklistResult } from '@/lib/types/database'
import type {
  Client,
  Profile,
  QuoteBankValue,
  SystemSpecTemplate,
  WorkTypeField,
  SystemWorkTypeMargin,
  WorkTypeSetting,
  QuoteDesignCategory,
  SystemType,
  ServiceType,
  QuoteService,
  AssetType,
  Site,
} from '@/lib/types/database'

export const metadata = { title: 'New Quote | Pyrocel' }

export default async function NewQuotePage({
  searchParams,
}: {
  searchParams: Promise<{ site?: string; defect?: string }>
}) {
  const { site: siteParam, defect: defectParam } = await searchParams
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  if (!profile || !['admin', 'office'].includes((profile as Profile).role)) {
    redirect('/dashboard')
  }

  // The quote author's department margin (if any) overrides the company default.
  const departmentId = (profile as Profile).department_id
  const { data: department } = departmentId
    ? await supabase
        .from('departments')
        .select('default_margin_percent')
        .eq('id', departmentId)
        .maybeSingle()
    : { data: null }

  const [
    { data: clients },
    { data: sites },
    { data: systemTypes },
    { data: serviceTypes },
    { data: quoteServices },
    { data: assetTypes },
    { data: ppmEngineerCost },
    { data: specTemplates },
    { data: workTypeFields },
    { data: systemWorkTypeMargins },
    { data: workTypeSettings },
    { data: designCategories },
    { data: bankValues },
    { data: companyInfo },
  ] = await Promise.all([
    supabase.from('clients').select('id, name').order('name'),
    supabase.from('sites').select('id, name, client_id').order('name'),
    supabase.from('system_types').select('*').eq('active', true).order('name'),
    supabase.from('service_types').select('*').order('name'),
    supabase.from('quote_services').select('*').eq('active', true).order('position').order('name'),
    supabase.from('asset_types').select('*').eq('active', true).order('position').order('name'),
    supabase
      .from('direct_costs')
      .select('hourly_cost_pence')
      .ilike('role', '%PPM%')
      .limit(1)
      .maybeSingle(),
    supabase.from('system_spec_templates').select('*').eq('active', true),
    supabase.from('work_type_fields').select('*').eq('active', true).order('position'),
    supabase.from('system_work_type_margins').select('*'),
    supabase.from('work_type_settings').select('*'),
    supabase.from('quote_design_categories').select('*').eq('active', true).order('name'),
    supabase.from('quote_bank_values').select('*'),
    supabase.from('company_info').select('default_margin_percent').limit(1).maybeSingle(),
  ])

  // When opened from a site (e.g. the site's Quotes tab), preselect that site
  // and its client so the new quote is linked to it from the start.
  const initialSite = siteParam
    ? ((sites ?? []) as Site[]).find((s) => s.id === siteParam)
    : undefined

  // When launched from a defect, prefill the quote with the site/client, a
  // remedial title, and a scope of works seeded from the failed checklist items.
  let defectPrefill:
    | { defectId: string; clientId?: string; siteId?: string; title: string; notes: string }
    | undefined
  if (defectParam) {
    const { data: defect } = await supabase
      .from('defects')
      .select(
        `id, site_id, client_id, reference_number,
         task_result:task_results(checklist_results),
         site:sites(name)`,
      )
      .eq('id', defectParam)
      .maybeSingle()

    if (defect) {
      const d = defect as any
      const failedItems = getFailedChecklistItems(
        (d.task_result?.checklist_results ?? []) as ChecklistResult[],
      )
      const siteName: string | null = d.site?.name ?? null
      defectPrefill = {
        defectId: d.id,
        clientId: d.client_id ?? undefined,
        siteId: d.site_id ?? undefined,
        title: `Remedial works${siteName ? ` — ${siteName}` : ''}${
          d.reference_number ? ` (${d.reference_number})` : ''
        }`,
        notes: buildRemedialScope(failedItems, {
          reference: d.reference_number,
          siteName,
        }),
      }
    }
  }

  const defaultHourlyCostPence = (ppmEngineerCost as { hourly_cost_pence: number } | null)?.hourly_cost_pence ?? 0
  const defaultMarginPercent = resolveDefaultMargin(
    (department as { default_margin_percent: number } | null)?.default_margin_percent ?? null,
    (companyInfo as { default_margin_percent: number } | null)?.default_margin_percent ?? null,
  )

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2">
        <Button variant="ghost" size="sm" className="w-fit -ml-2" asChild>
          <Link href="/dashboard/sales/quotes">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Quotes
          </Link>
        </Button>
        <h1 className="text-3xl font-bold tracking-tight">New Quote</h1>
        <p className="text-muted-foreground">Build a quote from one or more systems with line items.</p>
      </div>

      <QuoteBuilder
        clients={(clients ?? []) as Client[]}
        sites={(sites ?? []) as Site[]}
        initialClientId={defectPrefill?.clientId ?? initialSite?.client_id ?? undefined}
        initialSiteId={defectPrefill?.siteId ?? initialSite?.id ?? undefined}
        initialTitle={defectPrefill?.title}
        initialNotes={defectPrefill?.notes}
        defectId={defectPrefill?.defectId}
        systemTypes={(systemTypes ?? []) as SystemType[]}
        serviceTypes={(serviceTypes ?? []) as ServiceType[]}
        quoteServices={(quoteServices ?? []) as QuoteService[]}
        assetTypes={(assetTypes ?? []) as AssetType[]}
        defaultHourlyCostPence={defaultHourlyCostPence}
        defaultMarginPercent={defaultMarginPercent}
        specTemplates={(specTemplates ?? []) as SystemSpecTemplate[]}
        workTypeFields={(workTypeFields ?? []) as WorkTypeField[]}
        systemWorkTypeMargins={(systemWorkTypeMargins ?? []) as SystemWorkTypeMargin[]}
        workTypeSettings={(workTypeSettings ?? []) as WorkTypeSetting[]}
        designCategories={(designCategories ?? []) as QuoteDesignCategory[]}
        bankValues={(bankValues ?? []) as QuoteBankValue[]}
      />
    </div>
  )
}
