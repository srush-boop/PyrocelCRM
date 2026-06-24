import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import { QuoteBuilder } from '@/components/dashboard/sales/quote-builder'
import { QuoteStatusPanel } from '@/components/dashboard/sales/quote-status-panel'
import { QuoteGroupPanel } from '@/components/dashboard/sales/quote-group-panel'
import type {
  Client,
  Profile,
  Quote,
  QuoteCatalogueItem,
  QuoteLineItem,
  QuoteSystem,
  QuoteBankValue,
  SystemSpecTemplate,
  WorkTypeField,
  QuoteDesignCategory,
  SystemType,
  AssetType,
  QuoteSystemPpm,
  Site,
} from '@/lib/types/database'

export default async function QuoteDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  if (!profile || !['admin', 'office'].includes((profile as Profile).role)) {
    redirect('/dashboard')
  }

  const { data: quote } = await supabase
    .from('quotes')
    .select('*, client:clients(id, name), site:sites(id, name)')
    .eq('id', id)
    .single()
  if (!quote) notFound()

  const typedQuote = quote as Quote
  // The group is keyed by the master quote id (self if this is the master).
  const masterId = typedQuote.master_quote_id ?? typedQuote.id

  const [
    { data: systems },
    { data: lines },
    { data: clients },
    { data: sites },
    { data: systemTypes },
    { data: assetTypes },
    { data: ppmRows },
    { data: ppmEngineerCost },
    { data: catalogue },
    { data: specTemplates },
    { data: workTypeFields },
    { data: designCategories },
    { data: bankValues },
    { data: groupMembers },
    { data: companyInfo },
  ] = await Promise.all([
    supabase.from('quote_systems').select('*').eq('quote_id', id).order('position'),
    supabase.from('quote_line_items').select('*').eq('quote_id', id).order('position'),
    supabase.from('clients').select('id, name').order('name'),
    supabase.from('sites').select('id, name, client_id').order('name'),
    supabase.from('system_types').select('*').eq('active', true).order('name'),
    supabase.from('asset_types').select('*').eq('active', true).order('position').order('name'),
    supabase
      .from('quote_system_ppm')
      .select('*, quote_systems!inner(quote_id)')
      .eq('quote_systems.quote_id', id),
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
    supabase
      .from('quotes')
      .select('id, quote_number, reference, revision, variant_label, is_master, status, total_pence, master_quote_id')
      .or(`id.eq.${masterId},master_quote_id.eq.${masterId}`)
      .order('revision'),
    supabase.from('company_info').select('default_margin_percent').limit(1).maybeSingle(),
  ])

  const defaultHourlyCostPence = (ppmEngineerCost as { hourly_cost_pence: number } | null)?.hourly_cost_pence ?? 0
  const defaultMarginPercent =
    (companyInfo as { default_margin_percent: number } | null)?.default_margin_percent ?? 0

  const editable = typedQuote.status === 'draft'

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">{typedQuote.title}</h1>
        <p className="text-muted-foreground">
          {typedQuote.reference ?? typedQuote.quote_number ?? 'Draft'}
          {typedQuote.revision > 0 ? ` · Rev ${typedQuote.revision}` : ''}
          {typedQuote.variant_label ? ` · ${typedQuote.variant_label}` : ''} ·{' '}
          {typedQuote.client?.name ?? typedQuote.prospect_name ?? 'No client'}
        </p>
      </div>

      <QuoteStatusPanel quote={typedQuote} />

      <QuoteGroupPanel
        currentId={typedQuote.id}
        members={(groupMembers ?? []) as Parameters<typeof QuoteGroupPanel>[0]['members']}
      />

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
        quote={typedQuote}
        initialSystems={(systems ?? []) as QuoteSystem[]}
        initialLines={(lines ?? []) as QuoteLineItem[]}
        initialPpm={(ppmRows ?? []) as QuoteSystemPpm[]}
        readOnly={!editable}
      />
    </div>
  )
}
