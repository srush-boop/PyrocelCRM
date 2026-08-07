'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { FileText, ExternalLink, CircleCheckBig, RotateCcw, Loader2, Receipt } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { FormDocument, FormDocumentStatus } from '@/lib/types/database'
import { setFormDocumentStatus } from '@/lib/actions/form-documents'

const STATUS_META: Record<FormDocumentStatus, { label: string; className: string }> = {
  outstanding: {
    label: 'Outstanding',
    className: 'bg-amber-100 text-amber-800 hover:bg-amber-100',
  },
  complete: {
    label: 'Complete',
    className: 'bg-emerald-100 text-emerald-800 hover:bg-emerald-100',
  },
}

function fmtDate(d: string | null): string {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

export function FormDocumentsSection({ documents }: { documents: FormDocument[] }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [busyId, setBusyId] = useState<string | null>(null)

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | FormDocumentStatus>('all')
  const [submitterFilter, setSubmitterFilter] = useState<string>('all')
  const [formFilter, setFormFilter] = useState<string>('all')

  // Distinct submitters / forms for the filter dropdowns.
  const submitters = useMemo(() => {
    const m = new Map<string, string>()
    for (const d of documents) {
      if (d.submitterId) m.set(d.submitterId, d.submitterName ?? 'Unknown')
    }
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]))
  }, [documents])

  const forms = useMemo(() => {
    const s = new Set<string>()
    for (const d of documents) s.add(d.formName)
    return [...s].sort()
  }, [documents])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return documents.filter((d) => {
      if (statusFilter !== 'all' && d.status !== statusFilter) return false
      if (submitterFilter !== 'all' && d.submitterId !== submitterFilter) return false
      if (formFilter !== 'all' && d.formName !== formFilter) return false
      if (q) {
        const hay = [
          d.formName,
          d.submitterName ?? '',
          d.reference ?? '',
          ...d.files.map((f) => f.name),
        ]
          .join(' ')
          .toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [documents, search, statusFilter, submitterFilter, formFilter])

  const outstandingCount = documents.filter((d) => d.status === 'outstanding').length

  function updateStatus(instanceId: string, status: FormDocumentStatus) {
    setBusyId(instanceId)
    startTransition(async () => {
      const res = await setFormDocumentStatus(instanceId, status)
      setBusyId(null)
      if (res.ok) router.refresh()
    })
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Receipt className="h-4 w-4" />
            Expense &amp; receipt documents
          </CardTitle>
          <Badge variant="secondary" className="tabular-nums">
            {outstandingCount} outstanding
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          Documents submitted through Tasks &amp; Forms that are routed here for
          payment processing. Track each one Outstanding &rarr; Complete.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2">
          <Input
            placeholder="Search form, person, file, reference…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 w-full sm:w-64"
          />
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
            <SelectTrigger className="h-9 w-full sm:w-40">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="outstanding">Outstanding</SelectItem>
              <SelectItem value="complete">Complete</SelectItem>
            </SelectContent>
          </Select>
          <Select value={submitterFilter} onValueChange={setSubmitterFilter}>
            <SelectTrigger className="h-9 w-full sm:w-48">
              <SelectValue placeholder="Submitter" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All submitters</SelectItem>
              {submitters.map(([id, name]) => (
                <SelectItem key={id} value={id}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {forms.length > 1 ? (
            <Select value={formFilter} onValueChange={setFormFilter}>
              <SelectTrigger className="h-9 w-full sm:w-48">
                <SelectValue placeholder="Form" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All forms</SelectItem>
                {forms.map((f) => (
                  <SelectItem key={f} value={f}>
                    {f}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
        </div>

        {/* Table */}
        {filtered.length === 0 ? (
          <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
            {documents.length === 0
              ? 'No form documents yet. Turn on “Route uploads to Purchase Invoices” on a form in Settings → Internal Tasks & Forms.'
              : 'No documents match these filters.'}
          </p>
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Submitter</TableHead>
                  <TableHead>Form</TableHead>
                  <TableHead>Submitted</TableHead>
                  <TableHead>Documents</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((d) => {
                  const meta = STATUS_META[d.status]
                  const busy = pending && busyId === d.instanceId
                  return (
                    <TableRow key={d.instanceId}>
                      <TableCell className="font-medium">
                        {d.submitterName ?? 'Unknown'}
                      </TableCell>
                      <TableCell>
                        <div>{d.formName}</div>
                        {d.reference ? (
                          <div className="text-xs text-muted-foreground">
                            Ref: {d.reference}
                          </div>
                        ) : null}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                        {fmtDate(d.submittedAt)}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          {d.files.map((f) => (
                            <a
                              key={f.id}
                              href={`/api/internal-tasks/attachments/file?id=${f.id}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
                            >
                              <FileText className="h-3.5 w-3.5 shrink-0" />
                              <span className="max-w-[220px] truncate">{f.name}</span>
                              <ExternalLink className="h-3 w-3 shrink-0 opacity-60" />
                            </a>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge className={cn('font-normal', meta.className)}>{meta.label}</Badge>
                        {d.status === 'complete' && d.completedByName ? (
                          <div className="mt-0.5 text-xs text-muted-foreground">
                            by {d.completedByName}
                          </div>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-right">
                        {d.status === 'outstanding' ? (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busy}
                            onClick={() => updateStatus(d.instanceId, 'complete')}
                          >
                            {busy ? (
                              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <CircleCheckBig className="mr-1.5 h-3.5 w-3.5" />
                            )}
                            Mark complete
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={busy}
                            onClick={() => updateStatus(d.instanceId, 'outstanding')}
                          >
                            {busy ? (
                              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                            )}
                            Reopen
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
