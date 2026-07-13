'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Mail, TrendingUp, Loader2, CheckCircle2 } from 'lucide-react'
import { formatPence } from '@/lib/billing/invoices'
import { MONTH_LABELS, RECURRING_FREQUENCY_LABELS, marginPct } from '@/lib/billing/recurring'
import { applyBulkIncrease, sendRenewalNotice, type RenewalRow } from '@/lib/actions/recurring-renewals'

interface RenewalsManagerProps {
  rows: RenewalRow[]
  month: number
}

interface AccountGroup {
  accountId: string
  accountName: string
  hasEmail: boolean
  charges: RenewalRow[]
}

export function RenewalsManager({ rows, month }: RenewalsManagerProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [percent, setPercent] = useState('')
  const [fixedPounds, setFixedPounds] = useState('')
  const [roundToPound, setRoundToPound] = useState(true)
  const [applying, setApplying] = useState(false)
  const [sendingAccount, setSendingAccount] = useState<string | null>(null)

  const groups = useMemo<AccountGroup[]>(() => {
    const map = new Map<string, AccountGroup>()
    for (const r of rows) {
      const id = r.billing_account?.id ?? 'unknown'
      if (!map.has(id)) {
        map.set(id, {
          accountId: id,
          accountName: r.billing_account?.name ?? 'Unknown account',
          hasEmail: !!(r.billing_account?.invoice_email || r.billing_account?.client?.contact_email),
          charges: [],
        })
      }
      map.get(id)!.charges.push(r)
    }
    return Array.from(map.values()).sort((a, b) => a.accountName.localeCompare(b.accountName))
  }, [rows])

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleGroup = (group: AccountGroup, on: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev)
      for (const c of group.charges) {
        if (on) next.add(c.id)
        else next.delete(c.id)
      }
      return next
    })
  }

  const handleApply = async () => {
    const pct = percent ? Number(percent) : null
    const fixedPence = fixedPounds ? Math.round(Number(fixedPounds) * 100) : null
    if ((!pct || Number.isNaN(pct)) && (!fixedPence || Number.isNaN(fixedPence))) {
      toast.error('Enter a percentage or a fixed amount')
      return
    }
    setApplying(true)
    const result = await applyBulkIncrease({
      chargeIds: Array.from(selected),
      percent: pct,
      fixedPence,
      roundToPound,
    })
    setApplying(false)
    if (result.error) {
      toast.error(result.error)
    } else {
      toast.success(`Updated ${result.updated} charge${result.updated === 1 ? '' : 's'}`)
      setPercent('')
      setFixedPounds('')
      setSelected(new Set())
      startTransition(() => router.refresh())
    }
  }

  const handleSend = async (group: AccountGroup) => {
    setSendingAccount(group.accountId)
    const result = await sendRenewalNotice(
      group.accountId,
      group.charges.map((c) => c.id),
    )
    setSendingAccount(null)
    if (result.error) {
      toast.error(result.error)
    } else {
      toast.success(`Renewal notice sent to ${result.sentTo}`)
      startTransition(() => router.refresh())
    }
  }

  return (
    <div className="space-y-6">
      {/* Month selector */}
      <div className="flex items-center gap-3">
        <Label htmlFor="renewal-month" className="text-sm font-medium">
          Renewal month
        </Label>
        <Select
          value={String(month)}
          onValueChange={(v) => router.push(`/dashboard/invoices/renewals?month=${v}`)}
        >
          <SelectTrigger id="renewal-month" className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MONTH_LABELS.map((label, i) => (
              <SelectItem key={label} value={String(i + 1)}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Bulk increase toolbar */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <TrendingUp className="h-4 w-4 text-primary" />
            Bulk price increase
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Select charges below, then apply an increase. Changes take effect immediately on the
            live price and are recorded in each charge&apos;s price history.
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="pct">Increase %</Label>
              <Input
                id="pct"
                type="number"
                inputMode="decimal"
                placeholder="e.g. 5"
                value={percent}
                onChange={(e) => setPercent(e.target.value)}
                className="w-28"
              />
            </div>
            <span className="pb-2 text-sm text-muted-foreground">and / or</span>
            <div className="space-y-1.5">
              <Label htmlFor="fixed">Fixed £</Label>
              <Input
                id="fixed"
                type="number"
                inputMode="decimal"
                placeholder="e.g. 10"
                value={fixedPounds}
                onChange={(e) => setFixedPounds(e.target.value)}
                className="w-28"
              />
            </div>
            <label className="flex items-center gap-2 pb-2 text-sm">
              <Checkbox
                checked={roundToPound}
                onCheckedChange={(v) => setRoundToPound(!!v)}
              />
              Round to nearest £
            </label>
            <Button
              onClick={handleApply}
              disabled={applying || selected.size === 0}
              className="gap-2"
            >
              {applying ? <Loader2 className="h-4 w-4 animate-spin" /> : <TrendingUp className="h-4 w-4" />}
              Apply to {selected.size} selected
            </Button>
          </div>
        </CardContent>
      </Card>

      {groups.length === 0 && (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            No recurring charges renew in {MONTH_LABELS[month - 1]}.
          </CardContent>
        </Card>
      )}

      {/* Per-account groups */}
      {groups.map((group) => {
        const allSelected = group.charges.every((c) => selected.has(c.id))
        return (
          <Card key={group.accountId}>
            <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
              <div className="flex items-center gap-3">
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={(v) => toggleGroup(group, !!v)}
                  aria-label={`Select all charges for ${group.accountName}`}
                />
                <CardTitle className="text-base">{group.accountName}</CardTitle>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                disabled={!group.hasEmail || sendingAccount === group.accountId}
                onClick={() => handleSend(group)}
              >
                {sendingAccount === group.accountId ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Mail className="h-4 w-4" />
                )}
                Send renewal notice
              </Button>
            </CardHeader>
            <CardContent className="space-y-2">
              {!group.hasEmail && (
                <p className="text-xs text-amber-700">
                  No invoice email on this account or its client — add one to send a notice.
                </p>
              )}
              {group.charges.map((c) => {
                const margin = marginPct(c.unit_price_pence, c.subcontract_price_pence)
                return (
                  <div
                    key={c.id}
                    className="flex items-center justify-between gap-3 rounded-md border px-3 py-2"
                  >
                    <div className="flex items-center gap-3">
                      <Checkbox
                        checked={selected.has(c.id)}
                        onCheckedChange={() => toggle(c.id)}
                        aria-label={`Select ${c.description}`}
                      />
                      <div>
                        <div className="flex items-center gap-2 text-sm font-medium">
                          {c.description}
                          {c.notice_sent_at && (
                            <span className="inline-flex items-center gap-1 text-xs font-normal text-emerald-600">
                              <CheckCircle2 className="h-3 w-3" />
                              Notice sent
                            </span>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                          <span>{RECURRING_FREQUENCY_LABELS[c.frequency]}</span>
                          {c.is_subcontracted && margin !== null && (
                            <Badge variant="secondary" className="text-[10px]">
                              Margin {margin}%
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="text-right text-sm font-semibold tabular-nums">
                      {formatPence(c.unit_price_pence * c.quantity)}
                    </div>
                  </div>
                )
              })}
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
