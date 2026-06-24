import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { QuoteBuilder } from '@/components/dashboard/sales/quote-builder'
import { resolveDefaultMargin, fetchAllCatalogueItems } from '@/lib/sales'
import type {
  Client,
  Profile,
  QuoteCatalogueItem,
  QuoteBankValue,
  SystemSpecTemplate,
  WorkTypeField,
  SystemWorkTypeMargin,
  WorkTypeSetting,
  QuoteDesignCategory,
  SystemType,
  ServiceType,
  AssetType,
  Site,
} from '@/lib/types/database'

export const metadata = { title: 'New Quote | Pyrocel' }

export default async function NewQuotePage({
  searchParams,
}: {
  searchParams: Promise<{ site?: string }>
}) {
  const { site: siteParam } = await searchParams
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
    { data: assetTypes },
    { data: ppmEngineerCost },
    catalogue,
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
    supabase.from('asset_types').select('*').eq('active', true).order('position').order('name'),
    supabase
      .from('direct_costs')
      .select('hourly_cost_pence')
      .ilike('role', '%PPM%')
      .limit(1)
      .maybeSingle(),
    fetchAllCatalogueItems(supabase, { activeOnly: true }),
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
        initialClientId={initialSite?.client_id ?? undefined}
        initialSiteId={initialSite?.id ?? undefined}
        systemTypes={(systemTypes ?? []) as SystemType[]}
        serviceTypes={(serviceTypes ?? []) as ServiceType[]}
        assetTypes={(assetTypes ?? []) as AssetType[]}
        defaultHourlyCostPence={defaultHourlyCostPence}
        defaultMarginPercent={defaultMarginPercent}
        catalogue={(catalogue ?? []) as QuoteCatalogueItem[]}
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
