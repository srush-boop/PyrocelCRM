'use client'

import { Search, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  MultiSelectFilter,
  type MultiSelectOption,
} from '@/components/dashboard/calendar/multi-select-filter'

// The full, controlled filter state for the invoices table. Each array is an
// OR-set; an empty array means "no filter" for that dimension.
export interface InvoiceFilterState {
  search: string
  docTypes: string[]
  financialYears: string[]
  billingAccounts: string[]
  sites: string[]
  clients: string[]
  flags: string[]
}

export const EMPTY_INVOICE_FILTERS: InvoiceFilterState = {
  search: '',
  docTypes: [],
  financialYears: [],
  billingAccounts: [],
  sites: [],
  clients: [],
  flags: [],
}

// Delivery/export flag options. Opposing pairs (e.g. sent + unsent) combine to
// "show all", so selecting both is a no-op — matching OR-set semantics.
export const FLAG_OPTIONS: MultiSelectOption[] = [
  { value: 'sent', label: 'Sent to client' },
  { value: 'unsent', label: 'Not sent' },
  { value: 'sage_exported', label: 'Sent to Sage' },
  { value: 'sage_pending', label: 'Not in Sage' },
]

export const DOC_TYPE_OPTIONS: MultiSelectOption[] = [
  { value: 'invoice', label: 'Invoice' },
  { value: 'credit_note', label: 'Credit note' },
]

interface InvoicesFiltersProps {
  value: InvoiceFilterState
  onChange: (next: InvoiceFilterState) => void
  // Data-derived option lists (built by the table from the invoice rows).
  financialYearOptions: MultiSelectOption[]
  billingAccountOptions: MultiSelectOption[]
  siteOptions: MultiSelectOption[]
  clientOptions: MultiSelectOption[]
  // Count of rows currently matching, for the results summary.
  resultCount: number
  totalCount: number
}

// A comprehensive filter/search toolbar for the invoices table: a free-text
// search plus multi-select dropdowns for document type, financial year, billing
// account, site, client and delivery/export flags.
export function InvoicesFilters({
  value,
  onChange,
  financialYearOptions,
  billingAccountOptions,
  siteOptions,
  clientOptions,
  resultCount,
  totalCount,
}: InvoicesFiltersProps) {
  const set = <K extends keyof InvoiceFilterState>(key: K, next: InvoiceFilterState[K]) =>
    onChange({ ...value, [key]: next })

  const activeCount =
    (value.search.trim() ? 1 : 0) +
    value.docTypes.length +
    value.financialYears.length +
    value.billingAccounts.length +
    value.sites.length +
    value.clients.length +
    value.flags.length

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {/* Free-text search across number, bill-to, site, client, account. */}
        <div className="relative min-w-[220px] flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={value.search}
            onChange={(e) => set('search', e.target.value)}
            placeholder="Search number, client, site…"
            className="h-9 pl-9"
            aria-label="Search invoices"
          />
          {value.search && (
            <button
              type="button"
              onClick={() => set('search', '')}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-sm p-0.5 text-muted-foreground hover:text-foreground"
              aria-label="Clear search"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <MultiSelectFilter
          allLabel="All types"
          noun="types"
          options={DOC_TYPE_OPTIONS}
          selected={value.docTypes}
          onChange={(v) => set('docTypes', v)}
        />
        <MultiSelectFilter
          allLabel="All years"
          noun="years"
          options={financialYearOptions}
          selected={value.financialYears}
          onChange={(v) => set('financialYears', v)}
        />
        <MultiSelectFilter
          allLabel="All accounts"
          noun="accounts"
          options={billingAccountOptions}
          selected={value.billingAccounts}
          onChange={(v) => set('billingAccounts', v)}
          searchable
          searchPlaceholder="Search accounts…"
        />
        <MultiSelectFilter
          allLabel="All sites"
          noun="sites"
          options={siteOptions}
          selected={value.sites}
          onChange={(v) => set('sites', v)}
          searchable
          searchPlaceholder="Search sites…"
        />
        <MultiSelectFilter
          allLabel="All clients"
          noun="clients"
          options={clientOptions}
          selected={value.clients}
          onChange={(v) => set('clients', v)}
          searchable
          searchPlaceholder="Search clients…"
        />
        <MultiSelectFilter
          allLabel="Any status"
          noun="flags"
          options={FLAG_OPTIONS}
          selected={value.flags}
          onChange={(v) => set('flags', v)}
        />

        {activeCount > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="h-9 gap-1.5 text-muted-foreground"
            onClick={() => onChange(EMPTY_INVOICE_FILTERS)}
          >
            <X className="h-4 w-4" />
            Clear filters
            <Badge variant="secondary" className="ml-1">
              {activeCount}
            </Badge>
          </Button>
        )}
      </div>

      {activeCount > 0 && (
        <p className="text-sm text-muted-foreground" aria-live="polite">
          Showing <span className="font-medium text-foreground">{resultCount}</span> of {totalCount}{' '}
          invoice{totalCount === 1 ? '' : 's'}
        </p>
      )}
    </div>
  )
}
