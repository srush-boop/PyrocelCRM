import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { QuoteBuilder } from '@/components/dashboard/sales/quote-builder'
import { resolveDefaultMargin } from '@/lib/sales'
import type {
  Client,
  Profile,
  QuoteCatalogueItem,
  QuoteBankValue,
  SystemSpecTemplate,
  WorkTypeField,
  QuoteDesignCategory,
  SystemType,
  AssetType,
  Site,
} from '@/lib/types/database'

export const metadata = { title: 'New Quote | Pyrocel' }

export default async function NewQuotePage() {
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
    { data: assetTypes },
    { data: ppmEngineerCost },
    { data: catalogue },
    { data: specTemplates },
    { data: workTypeFields },
    { data: designCategories },
    { data: bankValues },
    { data: companyInfo },
  ] = await Promise.all([
    supabase.from('clients').select('id, name').order('name'),
    supabase.from('sites').select('id, name, client_id').order('name'),
    supabase.from('system_types').select('*').eq('active', true).order('name'),
    supabase.from('asset_types').select('*').eq('active', true).order('position').order('name'),
    supabase
      .from('direct_costs')
      .select('hourly_cost_pence')
      .ilike('role', '%PPM%')
      .limit(1)
      .maybeSingle(),
    supabase.from('quote_catalogue_items').select('*').eq('active', true).order('name'),
    supabase.from('system_spec_templates').select('*').eq('active', true),
    supabase.from('work_type_fields').select('*').eq('active', true).order('position'),
    supabase.from('quote_design_categories').select('*').eq('active', true).order('name'),
    supabase.from('quote_bank_values').select('*'),
    supabase.from('company_info').select('default_margin_percent').limit(1).maybeSingle(),
  ])

  const defaultHourlyCostPence = (ppmEngineerCost as { hourly_cost_pence: number } | null)?.hourly_cost_pence ?? 0
  const defaultMarginPercent = resolveDefaultMargin(
    (department as { default_margin_percent: number } | null)?.default_margin_percent ?? null,
    (companyInfo as { default_margin_percent: number } | null)?.default_margin_percent ?? null,
  )

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">New Quote</h1>
        <p className="text-muted-foreground">Build a quote from one or more systems with line items.</p>
      </div>

      <QuoteBuilder
        clients={(clients ?? []) as Client[]}
        sites={(sites ?? []) as Site[]}
        systemTypes={(systemTypes ?? []) as SystemType[]}
        assetTypes={(assetTypes ?? []) as AssetType[]}
        defaultHourlyCostPence={defaultHourlyCostPence}
        defaultMarginPercent={defaultMarginPercent}
        catalogue={(catalogue ?? []) as QuoteCatalogueItem[]}
        specTemplates={(specTemplates ?? []) as SystemSpecTemplate[]}
        workTypeFields={(workTypeFields ?? []) as WorkTypeField[]}
        designCategories={(designCategories ?? []) as QuoteDesignCategory[]}
        bankValues={(bankValues ?? []) as QuoteBankValue[]}
      />
    </div>
  )
}
