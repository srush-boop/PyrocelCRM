import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { DEFAULT_TAX_RATE } from '@/lib/billing/invoices'

// Company-level VAT settings. There is a single company_info row; the VAT rate
// and Sage tax code are set there (Settings -> Company) and applied to every new
// invoice. There are deliberately no per-charge tax overrides.
export interface CompanyTaxConfig {
  /** Numeric VAT rate, e.g. 20 for 20%. Drives invoice totals. */
  rate: number
  /** Sage 50 tax code, e.g. "T1". Drives the Sage export Tax Code column. */
  taxCode: string
}

const FALLBACK: CompanyTaxConfig = { rate: DEFAULT_TAX_RATE, taxCode: 'T1' }

/**
 * Resolve the company VAT config from company_info, falling back to sensible
 * UK standard-rate defaults (20% / T1) if the row or columns are missing.
 */
export async function getCompanyTaxConfig(): Promise<CompanyTaxConfig> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('company_info')
    .select('default_vat_rate, default_tax_code')
    .limit(1)
    .maybeSingle<{ default_vat_rate: number | null; default_tax_code: string | null }>()

  if (!data) return FALLBACK
  const rate = typeof data.default_vat_rate === 'number' ? data.default_vat_rate : FALLBACK.rate
  const taxCode = data.default_tax_code?.trim() || FALLBACK.taxCode
  return { rate, taxCode }
}
