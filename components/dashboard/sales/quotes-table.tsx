'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
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
  Plus,
  MoreHorizontal,
  GitBranch,
  Trash2,
  BookOpen,
  FileText,
  MessageCircle,
} from 'lucide-react'
import { GridSearch } from '@/components/dashboard/grid-header'
import { GridViewsBar } from '@/components/dashboard/grid-views-bar'
import { toast } from 'sonner'
import { cn, formatDateUK } from '@/lib/utils'
import { formatPence, quoteTypeLabel, QUOTE_STATUS_META, QUOTE_TYPES } from '@/lib/sales'
import type { Quote, QuoteStatus, SavedGridView, SharedGridView } from '@/lib/types/database'
import { deleteQuote, createRevision } from '@/app/(dashboard)/dashboard/sales/actions'

export function QuotesTable({
  quotes,
  newQuoteHref = '/dashboard/sales/new',
  unreadQueries = {},
  savedViews,
  sharedViews,
  currentUserId,
}: {
  quotes: Quote[]
  // Lets callers (e.g. a site's Quotes tab) deep-link "New Quote" with context
  // such as a preselected site.
  newQuoteHref?: string
  // Map of quote id -> number of unread client queries, for the "new questions"
  // badge on each row.
  unreadQueries?: Record<string, number>
  // Saved/shared views — only supplied on the standalone Quotes grid page.
  savedViews?: SavedGridView[]
  sharedViews?: SharedGridView[]
  currentUserId?: string
}) {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<string>('all')
  const [type, setType] = useState<string>('all')
  const [preparedBy, setPreparedBy] = useState<string>('all')
  const [deleteTarget, setDeleteTarget] = useState<Quote | null>(null)
  const [isPending, startTransition] = useTransition()

  const showViews = !!currentUserId
  const filters = { search, status, type, preparedBy }
  const isFiltered =
    search.trim() !== '' || status !== 'all' || type !== 'all' || preparedBy !== 'all'
  function applyFilters(f: Record<string, unknown>) {
    setSearch((f.search as string) ?? '')
    setStatus((f.status as string) ?? 'all')
    setType((f.type as string) ?? 'all')
    setPreparedBy((f.preparedBy as string) ?? 'all')
  }
  function handlePrint() {
    setTimeout(() => window.print(), 60)
  }

  // Distinct preparers present in the current quote set, for the filter dropdown.
  const preparers = useMemo(() => {
    const map = new Map<string, string>()
    for (const quote of quotes) {
      if (quote.preparer?.id && quote.preparer.full_name) {
        map.set(quote.preparer.id, quote.preparer.full_name)
      }
    }
    return Array.from(map, ([id, name]) => ({ id, name })).sort((a, b) =>
      a.name.localeCompare(b.name),
    )
  }, [quotes])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return quotes.filter((quote) => {
      if (status !== 'all' && quote.status !== status) return false
      if (type !== 'all' && quote.quote_type !== type) return false
      if (preparedBy !== 'all' && quote.preparer?.id !== preparedBy) return false
      if (!q) return true
      const target =
        quote.client?.name ?? quote.prospect_name ?? ''
      return (
        quote.title.toLowerCase().includes(q) ||
        (quote.quote_number ?? '').toLowerCase().includes(q) ||
        (quote.reference ?? '').toLowerCase().includes(q) ||
        target.toLowerCase().includes(q) ||
        (quote.preparer?.full_name ?? '').toLowerCase().includes(q)
      )
    })
  }, [quotes, search, status, type, preparedBy])

  function handleRevision(id: string) {
    startTransition(async () => {
      const res = await createRevision(id)
      if (res.ok && res.id) {
        toast.success('New revision created')
        router.push(`/dashboard/sales/${res.id}`)
      } else {
        toast.error(res.error ?? 'Could not create revision')
      }
    })
  }

  function handleDelete() {
    if (!deleteTarget) return
    const id = deleteTarget.id
    startTransition(async () => {
      const res = await deleteQuote(id)
      if (res.ok) {
        toast.success('Quote deleted')
        setDeleteTarget(null)
        router.refresh()
      } else {
        toast.error(res.error ?? 'Could not delete quote')
      }
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 no-print sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-wrap items-center gap-3">
          <GridSearch
            value={search}
            onChange={setSearch}
            placeholder="Search quotes..."
            className="w-full sm:max-w-xs"
          />
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {(Object.keys(QUOTE_STATUS_META) as QuoteStatus[]).map((s) => (
                <SelectItem key={s} value={s}>
                  {QUOTE_STATUS_META[s].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={type} onValueChange={setType}>
            <SelectTrigger className="w-[190px]">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              {QUOTE_TYPES.map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {preparers.length > 0 && (
            <Select value={preparedBy} onValueChange={setPreparedBy}>
              <SelectTrigger className="w-[190px]">
                <SelectValue placeholder="Prepared by" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All preparers</SelectItem>
                {preparers.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {showViews && (
            <GridViewsBar
              gridKey="quotes"
              filters={filters}
              isFiltered={isFiltered}
              onApply={applyFilters}
              savedViews={savedViews ?? []}
              sharedViews={sharedViews ?? []}
              currentUserId={currentUserId!}
              onPrint={handlePrint}
            />
          )}
          <Button variant="outline" asChild>
            <Link href="/dashboard/stock/catalogue">
              <BookOpen className="mr-2 h-4 w-4" />
              Catalogue
            </Link>
          </Button>
          <Button asChild>
            <Link href={newQuoteHref}>
              <Plus className="mr-2 h-4 w-4" />
              New Quote
            </Link>
          </Button>
        </div>
      </div>

      <Card className="no-print">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 p-12 text-center">
            <FileText className="h-8 w-8 text-muted-foreground" />
            <p className="font-medium">No quotes found</p>
            <p className="text-sm text-muted-foreground">
              {quotes.length === 0
                ? 'Create your first quote to get started.'
                : 'Try adjusting your search or filters.'}
            </p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Quote</TableHead>
                <TableHead>Client / Prospect</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Prepared by</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Valid until</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((quote) => (
                <TableRow
                  key={quote.id}
                  className="cursor-pointer"
                  onClick={() => router.push(`/dashboard/sales/${quote.id}`)}
                >
                  <TableCell>
                    <div className="flex items-center gap-1.5 font-medium">
                      {quote.title}
                      {quote.revision > 0 && (
                        <Badge variant="outline" className="text-[10px]">
                          Rev {quote.revision}
                        </Badge>
                      )}
                      {quote.variant_label && (
                        <Badge variant="outline" className="text-[10px]">
                          {quote.variant_label}
                        </Badge>
                      )}
                      {(unreadQueries[quote.id] ?? 0) > 0 && (
                        <Badge variant="destructive" className="gap-1 text-[10px]">
                          <MessageCircle className="h-3 w-3" />
                          {unreadQueries[quote.id]}
                        </Badge>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {quote.reference ?? quote.quote_number ?? 'Draft'}
                    </div>
                  </TableCell>
                  <TableCell>
                    {quote.client?.name ?? quote.prospect_name ?? '—'}
                    {quote.site?.name && (
                      <div className="text-xs text-muted-foreground">{quote.site.name}</div>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">{quoteTypeLabel(quote.quote_type)}</TableCell>
                  <TableCell>
                    <Badge variant="secondary" className={cn(QUOTE_STATUS_META[quote.status].badgeClass)}>
                      {QUOTE_STATUS_META[quote.status].label}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {formatPence(quote.total_pence, quote.currency)}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {quote.preparer?.full_name ?? '—'}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {quote.created_at ? formatDateUK(quote.created_at) : '—'}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {quote.valid_until ? formatDateUK(quote.valid_until) : '—'}
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreHorizontal className="h-4 w-4" />
                          <span className="sr-only">Quote actions</span>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handleRevision(quote.id)} disabled={isPending}>
                          <GitBranch className="mr-2 h-4 w-4" />
                          New revision
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={() => setDeleteTarget(quote)}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      {/* Print-only view — reflects the current filters. */}
      <div className="hidden print:block">
        <h1 className="text-xl font-bold">Quotes</h1>
        <p className="mb-4 text-sm">
          {status === 'all' ? 'All statuses' : QUOTE_STATUS_META[status as QuoteStatus]?.label}
          {type !== 'all' ? ` · ${quoteTypeLabel(type)}` : ''}
          {search ? ` · search: “${search}”` : ''} · {filtered.length} quote
          {filtered.length === 1 ? '' : 's'}
        </p>
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="border-b text-left">
              <th className="py-1 pr-2">Quote</th>
              <th className="py-1 pr-2">Ref</th>
              <th className="py-1 pr-2">Client / Prospect</th>
              <th className="py-1 pr-2">Type</th>
              <th className="py-1 pr-2">Status</th>
              <th className="py-1 pr-2 text-right">Total</th>
              <th className="py-1 pr-2">Prepared by</th>
              <th className="py-1 pr-2">Created</th>
              <th className="py-1 pr-2">Valid until</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((quote) => (
              <tr key={quote.id} className="border-b">
                <td className="py-1 pr-2 font-medium">{quote.title}</td>
                <td className="py-1 pr-2">{quote.reference ?? quote.quote_number ?? 'Draft'}</td>
                <td className="py-1 pr-2">{quote.client?.name ?? quote.prospect_name ?? '—'}</td>
                <td className="py-1 pr-2">{quoteTypeLabel(quote.quote_type)}</td>
                <td className="py-1 pr-2">{QUOTE_STATUS_META[quote.status].label}</td>
                <td className="py-1 pr-2 text-right tabular-nums">
                  {formatPence(quote.total_pence, quote.currency)}
                </td>
                <td className="py-1 pr-2">{quote.preparer?.full_name ?? '—'}</td>
                <td className="py-1 pr-2">
                  {quote.created_at ? formatDateUK(quote.created_at) : '—'}
                </td>
                <td className="py-1 pr-2">
                  {quote.valid_until ? formatDateUK(quote.valid_until) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete quote?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes &ldquo;{deleteTarget?.title}&rdquo; and all of its line items.
              This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
