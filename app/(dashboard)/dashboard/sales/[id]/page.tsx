import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { QuoteBuilder } from '@/components/dashboard/sales/quote-builder'
import { QuoteStatusPanel } from '@/components/dashboard/sales/quote-status-panel'
import { QuoteGroupPanel } from '@/components/dashboard/sales/quote-group-panel'
import { QuoteQueriesPanel } from '@/components/dashboard/sales/quote-queries-panel'
import { resolveDefaultMargin } from '@/lib/sales'
import { isRequirementStatus } from '@/lib/sales-requirements'
import type {
  Client,
  Profile,
  Quote,
  QuoteLineItem,
  QuoteSystem,
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
  QuoteSystemPpm,
  Site,
  QuoteMessage,
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
    .select('*, client:clients(id, name), site:sites(id, name), preparer:profiles!quotes_created_by_fkey(id, full_name)')
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
    { data: serviceTypes },
    { data: quoteServices },
    { data: assetTypes },
    { data: ppmRows },
    { data: ppmEngineerCost },
    { data: specTemplates },
    { data: workTypeFields },
    { data: systemWorkTypeMargins },
    { data: workTypeSettings },
    { data: designCategories },
    { data: bankValues },
    { data: groupMembers },
    { data: companyInfo },
    { data: department },
    { data: requirements },
    { data: requirementSources },
    { data: quoteMessages },
  ] = await Promise.all([
    supabase.from('quote_systems').select('*').eq('quote_id', id).order('position'),
    supabase.from('quote_line_items').select('*').eq('quote_id', id).order('position'),
    supabase.from('clients').select('id, name').order('name'),
    supabase.from('sites').select('id, name, client_id').order('name'),
    supabase.from('system_types').select('*').eq('active', true).order('name'),
    supabase.from('service_types').select('*').order('name'),
    supabase.from('quote_services').select('*').eq('active', true).order('position').order('name'),
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
    supabase.from('system_spec_templates').select('*').eq('active', true),
    supabase.from('work_type_fields').select('*').eq('active', true).order('position'),
    supabase.from('system_work_type_margins').select('*'),
    supabase.from('work_type_settings').select('*'),
    supabase.from('quote_design_categories').select('*').eq('active', true).order('name'),
    supabase.from('quote_bank_values').select('*'),
    supabase
      .from('quotes')
      .select('id, quote_number, reference, revision, variant_label, is_master, status, total_pence, master_quote_id')
      .or(`id.eq.${masterId},master_quote_id.eq.${masterId}`)
      .order('revision'),
    supabase.from('company_info').select('default_margin_percent').limit(1).maybeSingle(),
    (profile as Profile).department_id
      ? supabase
          .from('departments')
          .select('default_margin_percent')
          .eq('id', (profile as Profile).department_id as string)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from('quote_requirements').select('*').eq('quote_id', id).order('position'),
    supabase
      .from('quote_requirement_sources')
      .select('*')
      .eq('quote_id', id)
      .order('created_at', { ascending: false })
      .limit(1),
    supabase
      .from('quote_messages')
      .select('*')
      .eq('quote_id', id)
      .order('created_at', { ascending: true }),
  ])

  const defaultHourlyCostPence = (ppmEngineerCost as { hourly_cost_pence: number } | null)?.hourly_cost_pence ?? 0
  const defaultMarginPercent = resolveDefaultMargin(
    (department as { default_margin_percent: number } | null)?.default_margin_percent ?? null,
    (companyInfo as { default_margin_percent: number } | null)?.default_margin_percent ?? null,
  )

  const editable = typedQuote.status === 'draft'

  // Map saved requirement rows into the builder's editable draft shapes.
  const initialRequirements = ((requirements ?? []) as Array<{
    id: string
    category: string | null
    requirement: string
    our_response: string | null
    status: string
  }>).map((r) => ({
    key: r.id,
    category: r.category,
    requirement: r.requirement,
    our_response: r.our_response ?? '',
    status: isRequirementStatus(r.status) ? r.status : ('included' as const),
  }))

  const sourceRow = ((requirementSources ?? []) as Array<{
    source_type: string
    file_name: string | null
    file_url: string | null
    mime_type: string | null
    raw_text: string | null
    summary: string | null
  }>)[0]
  const initialRequirementSource = sourceRow
    ? {
        source_type: sourceRow.source_type === 'file' ? ('file' as const) : ('paste' as const),
        file_name: sourceRow.file_name,
        file_url: sourceRow.file_url,
        mime_type: sourceRow.mime_type,
        raw_text: sourceRow.raw_text,
        summary: sourceRow.summary,
      }
    : null

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2">
        <Button variant="ghost" size="sm" className="w-fit -ml-2" asChild>
          <Link href="/dashboard/sales/quotes">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Quotes
          </Link>
        </Button>
        <h1 className="text-3xl font-bold tracking-tight">{typedQuote.title}</h1>
        <p className="text-muted-foreground">
          {typedQuote.reference ?? typedQuote.quote_number ?? 'Draft'}
          {typedQuote.revision > 0 ? ` · Rev ${typedQuote.revision}` : ''}
          {typedQuote.variant_label ? ` · ${typedQuote.variant_label}` : ''} ·{' '}
          {typedQuote.client?.name ?? typedQuote.prospect_name ?? 'No client'}
        </p>
      </div>

      <QuoteStatusPanel quote={typedQuote} />

      <QuoteQueriesPanel
        quoteId={typedQuote.id}
        initialMessages={(quoteMessages ?? []) as QuoteMessage[]}
      />

      <QuoteGroupPanel
        currentId={typedQuote.id}
        members={(groupMembers ?? []) as Parameters<typeof QuoteGroupPanel>[0]['members']}
      />

      <QuoteBuilder
        clients={(clients ?? []) as Client[]}
        sites={(sites ?? []) as Site[]}
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
        quote={typedQuote}
        initialSystems={(systems ?? []) as QuoteSystem[]}
        initialLines={(lines ?? []) as QuoteLineItem[]}
        initialPpm={(ppmRows ?? []) as QuoteSystemPpm[]}
        initialRequirements={initialRequirements}
        initialRequirementSource={initialRequirementSource}
        readOnly={!editable}
      />
    </div>
  )
}
