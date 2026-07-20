'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Wallet, AlertTriangle, ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import type { BillingAccount } from '@/lib/types/database'
import type { RateCard } from '@/lib/billing/rate-cards'
import { resolveRateCardFromChain } from '@/lib/billing/rate-cards'
import { BillingStatusBadge } from './billing-status-badge'
import { resolveBillingAccount, isBillingOnHold } from '@/lib/billing/resolve-billing-account'
import { setSiteBillingAccount, setServiceBillingAccount } from '@/lib/actions/billing-accounts'
import { setSiteRateCard, setServiceRateCard } from '@/lib/actions/rate-cards'

interface ServiceRow {
  id: string
  name: string
  billing_account_id: string | null
  rate_card_id: string | null
}

// A billing account plus its owning client (embedded) so the dropdown can show
// which client an account belongs to when it isn't this site's own client.
type AccountOption = BillingAccount & { client?: { id: string; name: string } | null }

interface SiteBillingCardProps {
  siteId: string
  // This site's own client — used to resolve the client default and to flag
  // cross-client accounts in the dropdown.
  clientId: string
  siteBillingAccountId: string | null
  services: ServiceRow[]
  // ALL billing accounts across every client; a site may be billed to another
  // client's account (e.g. a central billing entity).
  accounts: AccountOption[]
  // Active rate cards for the override selectors (+ the company default flag).
  rateCards: RateCard[]
  // Site-level rate card override (null = inherit customer/default).
  siteRateCardId: string | null
}

const INHERIT = '__inherit__'

export function SiteBillingCard({
  siteId,
  clientId,
  siteBillingAccountId,
  services,
  accounts,
  rateCards,
  siteRateCardId,
}: SiteBillingCardProps) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [busyKey, setBusyKey] = useState<string | null>(null)

  // Rate card resolution helpers. Cards are keyed by id; the company default is
  // the ultimate fallback below every override level.
  const cardsById = new Map(rateCards.map((c) => [c.id, c]))
  const defaultCard = rateCards.find((c) => c.is_default && c.active) ?? null
  const rateCardName = (id: string | null) =>
    (id ? cardsById.get(id)?.name : null) ?? '—'
  // The customer (billing account) level rate card for a resolved account.
  const customerCardId = (accountId: string | null | undefined) =>
    (accountId ? accounts.find((a) => a.id === accountId)?.rate_card_id : null) ?? null
  // Billing detail is collapsed by default to keep the overview compact.
  const [expanded, setExpanded] = useState(false)

  // The client default is the default account belonging to THIS site's client.
  const clientDefault = accounts.find((a) => a.client_id === clientId && a.is_default) ?? null

  // Label an account, appending the client name when it belongs to a different
  // client than this site (so cross-client selections are unambiguous).
  const accountLabel = (a: AccountOption) =>
    a.client_id !== clientId && a.client?.name ? `${a.name} — ${a.client.name}` : a.name

  // Resolved account for the site itself (site override -> client default).
  const siteResolved = resolveBillingAccount(
    null,
    { billing_account_id: siteBillingAccountId },
    clientDefault,
    accounts,
  )

  function handleSiteChange(value: string) {
    const id = value === INHERIT ? null : value
    setBusyKey('site')
    startTransition(async () => {
      const result = await setSiteBillingAccount(siteId, id)
      setBusyKey(null)
      if (result.error) {
        toast.error(result.error)
        return
      }
      toast.success('Site billing account updated')
      router.refresh()
    })
  }

  function handleServiceChange(serviceId: string, value: string) {
    const id = value === INHERIT ? null : value
    setBusyKey(serviceId)
    startTransition(async () => {
      const result = await setServiceBillingAccount(serviceId, siteId, id)
      setBusyKey(null)
      if (result.error) {
        toast.error(result.error)
        return
      }
      toast.success('Service billing account updated')
      router.refresh()
    })
  }

  function handleSiteRateCardChange(value: string) {
    const id = value === INHERIT ? null : value
    setBusyKey('site-rate')
    startTransition(async () => {
      const result = await setSiteRateCard(siteId, id)
      setBusyKey(null)
      if (result.error) {
        toast.error(result.error)
        return
      }
      toast.success('Site rate card updated')
      router.refresh()
    })
  }

  function handleServiceRateCardChange(serviceId: string, value: string) {
    const id = value === INHERIT ? null : value
    setBusyKey(`rate-${serviceId}`)
    startTransition(async () => {
      const result = await setServiceRateCard(serviceId, id, siteId)
      setBusyKey(null)
      if (result.error) {
        toast.error(result.error)
        return
      }
      toast.success('Service rate card updated')
      router.refresh()
    })
  }

  return (
    <Card className="md:col-span-2">
      <CardHeader>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="flex w-full items-start justify-between gap-3 text-left"
        >
          <div className="space-y-1.5">
            <CardTitle className="flex items-center gap-2">
              <Wallet className="h-5 w-5" />
              Billing
            </CardTitle>
            <CardDescription>
              {expanded ? (
                <>
                  Which account each service is invoiced under. Services inherit the site, and the
                  site inherits the client&apos;s default account unless overridden.
                </>
              ) : (
                <span className="flex flex-wrap items-center gap-2">
                  {siteResolved.account ? (
                    <>
                      <span className="text-foreground">{siteResolved.account.name}</span>
                      <BillingStatusBadge status={siteResolved.account.status} />
                    </>
                  ) : (
                    <span>No billing account resolved</span>
                  )}
                </span>
              )}
            </CardDescription>
          </div>
          <ChevronDown
            className={`mt-1 h-5 w-5 shrink-0 text-muted-foreground transition-transform ${
              expanded ? 'rotate-180' : ''
            }`}
          />
        </button>
      </CardHeader>
      {expanded && (
      <CardContent className="space-y-4">
        {accounts.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            This site&apos;s client has no billing accounts yet. Add one from the client&apos;s
            &quot;Billing accounts&quot; menu.
          </p>
        ) : (
          <>
            {/* Site-level account */}
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3">
              <div className="min-w-0 space-y-1">
                <p className="text-sm font-medium">Site default</p>
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  {siteResolved.account ? (
                    <>
                      <span className="text-foreground">{siteResolved.account.name}</span>
                      <BillingStatusBadge status={siteResolved.account.status} />
                      <span>
                        {siteResolved.source === 'client-default'
                          ? 'inherited from client'
                          : 'set on site'}
                      </span>
                    </>
                  ) : (
                    <span>No account resolved</span>
                  )}
                </div>
                {isBillingOnHold(siteResolved.account) && (
                  <p className="flex items-center gap-1 text-xs text-amber-700 dark:text-amber-300">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    This account is {siteResolved.account?.status === 'suspended' ? 'suspended' : 'closed'} —
                    new work may not be billable.
                  </p>
                )}
              </div>
              <Select
                value={siteBillingAccountId ?? INHERIT}
                onValueChange={handleSiteChange}
                disabled={pending && busyKey === 'site'}
              >
                <SelectTrigger className="w-[220px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={INHERIT}>
                    Inherit client default{clientDefault ? ` (${clientDefault.name})` : ''}
                  </SelectItem>
                  {accounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {accountLabel(a)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Site-level rate card override */}
            {(() => {
              const custId = customerCardId(siteResolved.account?.id)
              const effective = resolveRateCardFromChain(
                { siteCardId: siteRateCardId, customerCardId: custId },
                cardsById,
                defaultCard,
              )
              const src = siteRateCardId
                ? 'set on site'
                : custId
                  ? 'from billing account'
                  : 'company default'
              return (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3">
                  <div className="min-w-0 space-y-1">
                    <p className="text-sm font-medium">Rate card</p>
                    <p className="text-xs text-muted-foreground">
                      <span className="text-foreground">{effective?.name ?? 'None'}</span>{' '}
                      {effective ? `(${src})` : '(no card configured)'}
                    </p>
                  </div>
                  <Select
                    value={siteRateCardId ?? INHERIT}
                    onValueChange={handleSiteRateCardChange}
                    disabled={pending && busyKey === 'site-rate'}
                  >
                    <SelectTrigger className="w-[220px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={INHERIT}>
                        Inherit customer / default
                        {custId ? ` (${rateCardName(custId)})` : defaultCard ? ` (${defaultCard.name})` : ''}
                      </SelectItem>
                      {rateCards
                        .filter((c) => c.active)
                        .map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.name}
                            {c.is_default ? ' (default)' : ''}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
              )
            })()}

            {/* Per-service overrides */}
            {services.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium">Services</p>
                <ul className="space-y-2">
                  {services.map((svc) => {
                    const resolved = resolveBillingAccount(
                      { billing_account_id: svc.billing_account_id },
                      { billing_account_id: siteBillingAccountId },
                      clientDefault,
                      accounts,
                    )
                    return (
                      <li
                        key={svc.id}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3"
                      >
                        <div className="min-w-0 space-y-1">
                          <p className="text-sm font-medium">{svc.name}</p>
                          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                            {resolved.account ? (
                              <>
                                <span className="text-foreground">{resolved.account.name}</span>
                                <BillingStatusBadge status={resolved.account.status} />
                                <span>
                                  {resolved.source === 'service'
                                    ? 'set on service'
                                    : resolved.source === 'site'
                                      ? 'inherited from site'
                                      : 'inherited from client'}
                                </span>
                              </>
                            ) : (
                              <span>No account resolved</span>
                            )}
                          </div>
                        </div>
                        <div className="flex flex-col gap-2">
                          <Select
                            value={svc.billing_account_id ?? INHERIT}
                            onValueChange={(v) => handleServiceChange(svc.id, v)}
                            disabled={pending && busyKey === svc.id}
                          >
                            <SelectTrigger className="w-[220px]">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value={INHERIT}>Inherit site</SelectItem>
                              {accounts.map((a) => (
                                <SelectItem key={a.id} value={a.id}>
                                  {accountLabel(a)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Select
                            value={svc.rate_card_id ?? INHERIT}
                            onValueChange={(v) => handleServiceRateCardChange(svc.id, v)}
                            disabled={pending && busyKey === `rate-${svc.id}`}
                          >
                            <SelectTrigger className="w-[220px]">
                              <SelectValue placeholder="Rate card" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value={INHERIT}>Rate card: inherit site</SelectItem>
                              {rateCards
                                .filter((c) => c.active)
                                .map((c) => (
                                  <SelectItem key={c.id} value={c.id}>
                                    Rate card: {c.name}
                                    {c.is_default ? ' (default)' : ''}
                                  </SelectItem>
                                ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              </div>
            )}
          </>
        )}
      </CardContent>
      )}
    </Card>
  )
}
