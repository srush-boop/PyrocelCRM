'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Mail,
  TrendingUp,
  Loader2,
  CheckCircle2,
  FilePlus,
  Search,
  AlertTriangle,
  X,
} from 'lucide-react'
import { formatPence } from '@/lib/billing/invoices'
import { MONTH_LABELS, RECURRING_FREQUENCY_LABELS, marginPct } from '@/lib/billing/recurring'
import { applyBulkIncrease, sendRenewalNotice, type RenewalRow } from '@/lib/actions/recurring-renewals'
import { createInvoiceFromRecurringCharges } from '@/lib/actions/recurring-invoices'

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

interface CommitJob {
  accountId: string
  accountName: string
  chargeIds: string[]
}

interface CommitResult {
  accountId: string
  accountName: string
  invoiceId?: string
  issues: string[]
  error?: string
}

type StatusFilter = 'to_commit' | 'committed' | 'all'
type NoticeFilter = 'all' | 'sent' | 'not_sent'

const COMMIT_CONCURRENCY = 4

// A charge counts as already committed for this renewal when it was invoiced
// from ~2 months before the renewal month onwards (covers raising renewals early).
function committedCutoff(month: number) {
  const d = new Date(new Date().getFullYear(), month - 1, 1)
  d.setDate(d.getDate() - 60)
  return d.toISOString().slice(0, 10)
}

export function RenewalsManager({ rows, month }: RenewalsManagerProps) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [percent, setPercent] = useState('')
  const [fixedPounds, setFixedPounds] = useState('')
  const [roundToPound, setRoundToPound] = useState(true)
  const [applying, setApplying] = useState(false)
  const [sendingAccount, setSendingAccount] = useState<string | null>(null)
  const [creatingAccount, setCreatingAccount] = useState<string | null>(null)

  const [search, setSearch] = useState('')
  const [frequency, setFrequency] = useState('all')
  const [notice, setNotice] = useState<NoticeFilter>('all')
  const [status, setStatus] = useState<StatusFilter>('to_commit')

  const [poNotRequired, setPoNotRequired] = useState(false)
  const [confirmJobs, setConfirmJobs] = useState<{ label: string; jobs: CommitJob[] } | null>(null)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [results, setResults] = useState<CommitResult[] | null>(null)

  const cutoff = useMemo(() => committedCutoff(month), [month])
  const isCommitted = (c: RenewalRow) => !!c.last_invoiced_date && c.last_invoiced_date >= cutoff
  const invoiceHref = (id: string) => `/dashboard/invoices/${id}?from=renewals&month=${month}`

  const frequencyOptions = useMemo(
    () => Array.from(new Set(rows.map((r) => r.frequency))),
    [rows],
  )

  const groups = useMemo<AccountGroup[]>(() => {
    const q = search.trim().toLowerCase()
    const map = new Map<string, AccountGroup>()
    for (const r of rows) {
      const committed = !!r.last_invoiced_date && r.last_invoiced_date >= cutoff
      if (status === 'to_commit' && committed) continue
      if (status === 'committed' && !committed) continue
      if (frequency !== 'all' && r.frequency !== frequency) continue
      if (notice === 'sent' && !r.notice_sent_at) continue
      if (notice === 'not_sent' && r.notice_sent_at) continue
      const accountName = r.billing_account?.name ?? 'Unknown account'
      if (
        q &&
        !accountName.toLowerCase().includes(q) &&
        !r.description.toLowerCase().includes(q) &&
        !(r.billing_account?.client?.name ?? '').toLowerCase().includes(q)
      ) {
        continue
      }
      const id = r.billing_account?.id ?? 'unknown'
      if (!map.has(id)) {
        map.set(id, {
          accountId: id,
          accountName,
          hasEmail: !!(r.billing_account?.invoice_email || r.billing_account?.client?.contact_email),
          charges: [],
        })
      }
      map.get(id)!.charges.push(r)
    }
    return Array.from(map.values()).sort((a, b) => a.accountName.localeCompare(b.accountName))
  }, [rows, search, frequency, notice, status, cutoff])

  const visibleCharges = useMemo(() => groups.flatMap((g) => g.charges), [groups])
  const filteredTotal = visibleCharges.reduce((s, c) => s + c.unit_price_pence * c.quantity, 0)
  const allVisibleSelected =
    visibleCharges.length > 0 && visibleCharges.every((c) => selected.has(c.id))
  const hasFilters = search !== '' || frequency !== 'all' || notice !== 'all' || status !== 'to_commit'

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const setMany = (charges: RenewalRow[], on: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev)
      for (const c of charges) {
        if (on) next.add(c.id)
        else next.delete(c.id)
      }
      return next
    })
  }

  // One job per account, skipping already-committed charges and unknown accounts.
  const buildJobs = (charges: RenewalRow[]): CommitJob[] => {
    const map = new Map<string, CommitJob>()
    for (const c of charges) {
      const accountId = c.billing_account?.id
      if (!accountId || isCommitted(c)) continue
      if (!map.has(accountId)) {
        map.set(accountId, {
          accountId,
          accountName: c.billing_account?.name ?? 'Unknown account',
          chargeIds: [],
        })
      }
      map.get(accountId)!.chargeIds.push(c.id)
    }
    return Array.from(map.values())
  }

  const selectedJobs = useMemo(
    () => buildJobs(rows.filter((r) => selected.has(r.id))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, selected, cutoff],
  )
  const filteredJobs = useMemo(
    () => buildJobs(visibleCharges),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [visibleCharges, cutoff],
  )

  const runCommit = async (jobs: CommitJob[]) => {
    setConfirmJobs(null)
    setResults(null)
    setProgress({ done: 0, total: jobs.length })
    const out: CommitResult[] = []
    let cursor = 0
    let done = 0
    const worker = async () => {
      while (cursor < jobs.length) {
        const job = jobs[cursor++]
        try {
          const res = await createInvoiceFromRecurringCharges(job.accountId, job.chargeIds, {
            poNotRequired,
          })
          out.push({
            accountId: job.accountId,
            accountName: job.accountName,
            invoiceId: res.invoiceId,
            issues: res.issues ?? [],
            error: res.error ?? undefined,
          })
        } catch (e) {
          out.push({
            accountId: job.accountId,
            accountName: job.accountName,
            issues: [],
            error: e instanceof Error ? e.message : 'Failed',
          })
        }
        done += 1
        setProgress({ done, total: jobs.length })
      }
    }
    await Promise.all(Array.from({ length: Math.min(COMMIT_CONCURRENCY, jobs.length) }, worker))
    setProgress(null)
    out.sort((a, b) => a.accountName.localeCompare(b.accountName))
    setResults(out)
    setSelected(new Set())
    const created = out.filter((r) => !r.error).length
    const attention = out.filter((r) => r.error || r.issues.length > 0).length
    if (attention === 0) toast.success(`${created} draft invoice${created === 1 ? '' : 's'} created`)
    else toast.warning(`${created} created · ${attention} need attention`)
    startTransition(() => router.refresh())
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

  // Single-account commit: no confirmation. Stays on this page unless the draft
  // has something that would block issuing, in which case it opens the draft.
  const handleCommitAccount = async (group: AccountGroup) => {
    const pending = group.charges.filter((c) => !isCommitted(c))
    const picked = pending.filter((c) => selected.has(c.id))
    const chargeIds = (picked.length > 0 ? picked : pending).map((c) => c.id)
    if (chargeIds.length === 0) {
      toast.info('Everything on this account is already committed')
      return
    }
    setCreatingAccount(group.accountId)
    const result = await createInvoiceFromRecurringCharges(group.accountId, chargeIds, {
      poNotRequired,
    })
    setCreatingAccount(null)
    if (result.error) {
      toast.error(result.error)
      return
    }
    setMany(group.charges, false)
    if (result.invoiceId && result.issues && result.issues.length > 0) {
      toast.warning(`Draft needs attention: ${result.issues.join('; ')}`)
      router.push(invoiceHref(result.invoiceId))
      return
    }
    toast.success(`${group.accountName} committed to invoicing`)
    startTransition(() => router.refresh())
  }

  const attentionResults = results?.filter((r) => r.error || r.issues.length > 0) ?? []
  const cleanCount = results ? results.length - attentionResults.length : 0
  const busy = progress !== null

  return (
    <div className="space-y-6">
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

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <TrendingUp className="h-4 w-4 text-primary" />
            Bulk price increase
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            Select charges below, then apply an increase. Changes take effect immediately on the
            live price and are recorded in each charge&apos;s price history.
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1.5">
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
            <div className="flex flex-col gap-1.5">
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
              <Checkbox checked={roundToPound} onCheckedChange={(v) => setRoundToPound(!!v)} />
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

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search account, client or charge"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
            aria-label="Search renewals"
          />
        </div>
        <Select value={status} onValueChange={(v) => setStatus(v as StatusFilter)}>
          <SelectTrigger className="w-44" aria-label="Commit status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="to_commit">To commit</SelectItem>
            <SelectItem value="committed">Already committed</SelectItem>
            <SelectItem value="all">All statuses</SelectItem>
          </SelectContent>
        </Select>
        <Select value={frequency} onValueChange={setFrequency}>
          <SelectTrigger className="w-40" aria-label="Frequency">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All frequencies</SelectItem>
            {frequencyOptions.map((f) => (
              <SelectItem key={f} value={f}>
                {RECURRING_FREQUENCY_LABELS[f]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={notice} onValueChange={(v) => setNotice(v as NoticeFilter)}>
          <SelectTrigger className="w-44" aria-label="Renewal notice">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any notice status</SelectItem>
            <SelectItem value="sent">Notice sent</SelectItem>
            <SelectItem value="not_sent">Notice not sent</SelectItem>
          </SelectContent>
        </Select>
        {hasFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSearch('')
              setFrequency('all')
              setNotice('all')
              setStatus('to_commit')
            }}
          >
            Clear filters
          </Button>
        )}
      </div>

      {/* Sticky commit bar */}
      <div className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card px-4 py-3 shadow-sm">
        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-sm font-medium">
            <Checkbox
              checked={allVisibleSelected}
              onCheckedChange={(v) => setMany(visibleCharges, !!v)}
              disabled={visibleCharges.length === 0}
              aria-label="Select all filtered charges"
            />
            Select all
          </label>
          <span className="text-sm text-muted-foreground">
            {groups.length} account{groups.length === 1 ? '' : 's'} · {visibleCharges.length} charge
            {visibleCharges.length === 1 ? '' : 's'} · {formatPence(filteredTotal)}
            {selected.size > 0 && (
              <span className="font-medium text-foreground"> · {selected.size} selected</span>
            )}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={poNotRequired} onCheckedChange={(v) => setPoNotRequired(!!v)} />
            PO not required
          </label>
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            disabled={busy || selectedJobs.length === 0}
            onClick={() => setConfirmJobs({ label: 'selected', jobs: selectedJobs })}
          >
            <FilePlus className="h-4 w-4" />
            Commit selected ({selectedJobs.length})
          </Button>
          <Button
            size="sm"
            className="gap-2"
            disabled={busy || filteredJobs.length === 0}
            onClick={() =>
              setConfirmJobs({ label: hasFilters ? 'all filtered' : 'all', jobs: filteredJobs })
            }
          >
            <FilePlus className="h-4 w-4" />
            Commit all ({filteredJobs.length})
          </Button>
        </div>
        {progress && (
          <div className="flex w-full items-center gap-3">
            <Progress value={(progress.done / progress.total) * 100} className="h-2" />
            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
              {progress.done} / {progress.total}
            </span>
          </div>
        )}
      </div>

      {results && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
            <CardTitle className="flex items-center gap-2 text-base">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              {cleanCount} draft invoice{cleanCount === 1 ? '' : 's'} ready
              {attentionResults.length > 0 && (
                <span className="font-normal text-muted-foreground">
                  {' '}
                  · {attentionResults.length} need attention
                </span>
              )}
            </CardTitle>
            <Button variant="ghost" size="icon" onClick={() => setResults(null)} aria-label="Dismiss results">
              <X className="h-4 w-4" />
            </Button>
          </CardHeader>
          {attentionResults.length > 0 && (
            <CardContent className="flex flex-col gap-2">
              {attentionResults.map((r) => (
                <div
                  key={r.accountId}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2"
                >
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                    <div className="text-sm">
                      <div className="font-medium">{r.accountName}</div>
                      <div className="text-xs text-amber-800">
                        {r.error ?? r.issues.join(' · ')}
                      </div>
                    </div>
                  </div>
                  {r.invoiceId && (
                    <Button asChild size="sm" variant="outline">
                      <Link href={invoiceHref(r.invoiceId)}>Open draft</Link>
                    </Button>
                  )}
                </div>
              ))}
            </CardContent>
          )}
        </Card>
      )}

      {groups.length === 0 && (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            {rows.length === 0
              ? `No recurring charges renew in ${MONTH_LABELS[month - 1]}.`
              : 'No charges match these filters.'}
          </CardContent>
        </Card>
      )}

      {groups.map((group) => {
        const allSelected = group.charges.every((c) => selected.has(c.id))
        const pendingCount = group.charges.filter((c) => !isCommitted(c)).length
        return (
          <Card key={group.accountId}>
            <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-4 space-y-0">
              <div className="flex items-center gap-3">
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={(v) => setMany(group.charges, !!v)}
                  aria-label={`Select all charges for ${group.accountName}`}
                />
                <CardTitle className="text-base">{group.accountName}</CardTitle>
              </div>
              <div className="flex items-center gap-2">
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
                <Button
                  size="sm"
                  className="gap-2"
                  disabled={
                    busy ||
                    group.accountId === 'unknown' ||
                    pendingCount === 0 ||
                    creatingAccount === group.accountId
                  }
                  onClick={() => handleCommitAccount(group)}
                >
                  {creatingAccount === group.accountId ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <FilePlus className="h-4 w-4" />
                  )}
                  Commit to invoicing
                </Button>
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {!group.hasEmail && (
                <p className="text-xs text-amber-700">
                  No invoice email on this account or its client — add one to send a notice.
                </p>
              )}
              {group.charges.map((c) => {
                const margin = marginPct(c)
                const committed = isCommitted(c)
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
                        <div className="flex flex-wrap items-center gap-2 text-sm font-medium">
                          {c.description}
                          {c.notice_sent_at && (
                            <span className="inline-flex items-center gap-1 text-xs font-normal text-emerald-600">
                              <CheckCircle2 className="h-3 w-3" />
                              Notice sent
                            </span>
                          )}
                          {committed && (
                            <Badge variant="secondary" className="text-[10px]">
                              Invoiced{' '}
                              {new Date(c.last_invoiced_date as string).toLocaleDateString('en-GB', {
                                day: 'numeric',
                                month: 'short',
                              })}
                            </Badge>
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

      <AlertDialog open={!!confirmJobs} onOpenChange={(open) => !open && setConfirmJobs(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Commit {confirmJobs?.label} to invoicing?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmJobs && (
                <>
                  This raises {confirmJobs.jobs.length} draft recurring invoice
                  {confirmJobs.jobs.length === 1 ? '' : 's'} (one per billing account) covering{' '}
                  {confirmJobs.jobs.reduce((s, j) => s + j.chargeIds.length, 0)} charges. Already
                  committed charges are skipped. You&apos;ll stay on this page — only drafts that
                  need attention are listed afterwards.
                  {poNotRequired && ' They will be marked "PO not required".'}
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => confirmJobs && runCommit(confirmJobs.jobs)}>
              Create drafts
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
