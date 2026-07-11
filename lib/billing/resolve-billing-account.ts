import type { BillingAccount } from '@/lib/types/database'

// A single source in the billing-account resolution chain. Each level may carry
// an explicit billing_account_id (an override) and/or an already-embedded
// billing_account object we can return directly.
interface BillingLevel {
  billing_account_id?: string | null
  billing_account?: BillingAccount | null
}

export type BillingAccountSource = 'service' | 'site' | 'client-default' | 'none'

export interface ResolvedBillingAccount {
  account: BillingAccount | null
  // Which level in the hierarchy the account was resolved from. Useful for the
  // UI to show "inherited from site" vs "overridden on this service".
  source: BillingAccountSource
}

/**
 * Resolve which billing account a service is invoiced under, following the
 * override hierarchy: service override -> site override -> client default.
 *
 * Pass whichever levels you have. Each level can supply an embedded
 * `billing_account` object (preferred) or just an id; when only ids are known,
 * `pool` is used to look up the matching account.
 *
 * @param service       The site_service level (most specific override).
 * @param site          The site level.
 * @param clientDefault The client's default billing account (fallback).
 * @param pool          Optional list of all candidate accounts for id lookups.
 */
export function resolveBillingAccount(
  service: BillingLevel | null | undefined,
  site: BillingLevel | null | undefined,
  clientDefault: BillingAccount | null | undefined,
  pool: BillingAccount[] = [],
): ResolvedBillingAccount {
  const find = (level: BillingLevel | null | undefined): BillingAccount | null => {
    if (!level) return null
    if (level.billing_account) return level.billing_account
    if (level.billing_account_id) {
      return pool.find((a) => a.id === level.billing_account_id) ?? null
    }
    return null
  }

  const fromService = find(service)
  if (fromService) return { account: fromService, source: 'service' }

  const fromSite = find(site)
  if (fromSite) return { account: fromSite, source: 'site' }

  if (clientDefault) return { account: clientDefault, source: 'client-default' }

  return { account: null, source: 'none' }
}

/** True when the resolved account is not actively billable (suspended/closed). */
export function isBillingOnHold(account: BillingAccount | null): boolean {
  return !!account && account.status !== 'live'
}
