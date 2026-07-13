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
import { Badge } from '@/components/ui/badge'
import { Wallet, AlertTriangle, PauseCircle } from 'lucide-react'
import { toast } from 'sonner'
import type {
  BillingAccount,
  RecurringFrequency,
  RecurringTiming,
} from '@/lib/types/database'
import { BillingStatusBadge } from './billing-status-badge'
import { resolveBillingAccount, isBillingOnHold } from '@/lib/billing/resolve-billing-account'
import { setSiteBillingAccount, setServiceBillingAccount } from '@/lib/actions/billing-accounts'
import { ANNUAL_OCCURRENCES } from '@/lib/billing/projected-revenue'
import { isDueNow } from '@/lib/billing/recurring'

interface ServiceCharge {
  id: string
  description: string
  unit_price_pence: number
  quantity: number
  frequency: RecurringFrequency
  active: boolean
  paused_by_service: boolean
  last_invoiced_date: string | null
  start_date: string | null
  timing: RecurringTiming
}

interface ServiceRow {
  id: string
  name: string
  active: boolean
  isRecurring: boolean
  billing_account_id: string | null
  charges: ServiceCharge[]
}

const GBP = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' })
const formatPence = (pence: number) => GBP.format(pence / 100)
const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

/** Annualised sell value (pence) of a service's active charges. */
function annualValuePence(charges: ServiceCharge[]): number {
  return charges
    .filter((c) => c.active)
    .reduce(
      (sum, c) => sum + c.unit_price_pence * (c.quantity || 1) * ANNUAL_OCCURRENCES[c.frequency],
      0,
    )
}

interface SiteBillingCardProps {
  siteId: string
  siteBillingAccountId: string | null
  services: ServiceRow[]
  // All billing accounts belonging to this site's client (includes sub-clients).
  accounts: BillingAccount[]
}

const INHERIT = '__inherit__'

export function SiteBillingCard({
  siteId,
  siteBillingAccountId,
  services,
  accounts,
}: SiteBillingCardProps) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [busyKey, setBusyKey] = useState<string | null>(null)

  const clientDefault = accounts.find((a) => a.is_default) ?? null

  // Site-wide annualised recurring value across all services' active charges.
  const siteAnnualPence = services.reduce((sum, s) => sum + annualValuePence(s.charges), 0)

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

  return (
    <Card className="md:col-span-2">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Wallet className="h-5 w-5" />
              Billing
            </CardTitle>
            <CardDescription className="mt-1.5">
              Which account each service is invoiced under, plus recurring value and status.
              Services inherit the site, and the site inherits the client&apos;s default account
              unless overridden.
            </CardDescription>
          </div>
          {siteAnnualPence > 0 && (
            <div className="rounded-md border bg-muted/40 px-3 py-1.5 text-right">
              <p className="text-xs text-muted-foreground">Projected annual value</p>
              <p className="text-lg font-semibold tabular-nums">{formatPence(siteAnnualPence)}</p>
            </div>
          )}
        </div>
      </CardHeader>
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
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

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
                    const activeCharges = svc.charges.filter((c) => c.active)
                    const pausedByService = svc.charges.filter((c) => c.paused_by_service).length
                    const annualPence = annualValuePence(svc.charges)
                    // Latest billed date across this service's charges.
                    const lastBilled = svc.charges
                      .map((c) => c.last_invoiced_date)
                      .filter((d): d is string => !!d)
                      .sort()
                      .at(-1)
                    // Overdue = a live charge whose next due date has passed since it
                    // was last billed (never-billed charges aren't flagged here).
                    const overdue =
                      svc.active &&
                      activeCharges.some((c) => c.last_invoiced_date && isDueNow(c))
                    // Status of the service's billing.
                    const status: { label: string; variant: 'default' | 'secondary' | 'outline' } =
                      !svc.active
                        ? { label: 'Inactive', variant: 'secondary' }
                        : svc.charges.length === 0
                          ? { label: 'No charges', variant: 'outline' }
                          : activeCharges.length === 0
                            ? { label: 'Paused', variant: 'secondary' }
                            : { label: 'Active', variant: 'default' }
                    return (
                      <li key={svc.id} className="space-y-3 rounded-md border p-3">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0 space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-sm font-medium">{svc.name}</p>
                              <Badge variant={status.variant} className="text-xs">
                                {status.label}
                              </Badge>
                            </div>
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
                          <Select
                            value={svc.billing_account_id ?? INHERIT}
                            onValueChange={(v) => handleServiceChange(svc.id, v)}
                            disabled={pending && busyKey === svc.id}
                          >
                            <SelectTrigger className="w-[200px]">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value={INHERIT}>Inherit site</SelectItem>
                              {accounts.map((a) => (
                                <SelectItem key={a.id} value={a.id}>
                                  {a.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        {/* Value / last-billed / paused summary for this service. */}
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t pt-2.5 text-xs">
                          {annualPence > 0 ? (
                            <span className="text-muted-foreground">
                              <span className="font-medium text-foreground tabular-nums">
                                {formatPence(annualPence)}
                              </span>{' '}
                              / year
                              {activeCharges.length > 0
                                ? ` · ${activeCharges.length} charge${activeCharges.length === 1 ? '' : 's'}`
                                : ''}
                            </span>
                          ) : svc.isRecurring ? (
                            <span className="text-muted-foreground">No recurring charges yet</span>
                          ) : (
                            <span className="text-muted-foreground">Not a recurring service</span>
                          )}

                          {lastBilled ? (
                            <span
                              className={
                                overdue
                                  ? 'flex items-center gap-1 font-medium text-amber-700 dark:text-amber-300'
                                  : 'text-muted-foreground'
                              }
                            >
                              {overdue && <AlertTriangle className="h-3.5 w-3.5" />}
                              Last billed {formatDate(lastBilled)}
                              {overdue ? ' · overdue' : ''}
                            </span>
                          ) : activeCharges.length > 0 ? (
                            <span className="text-muted-foreground">Not yet billed</span>
                          ) : null}

                          {pausedByService > 0 && (
                            <span className="flex items-center gap-1 text-muted-foreground">
                              <PauseCircle className="h-3.5 w-3.5" />
                              {pausedByService} paused with service
                            </span>
                          )}
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
    </Card>
  )
}
