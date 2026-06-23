'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
import { Plus, Search, MoreHorizontal, Copy, Trash2, BookOpen, FileText } from 'lucide-react'
import { toast } from 'sonner'
import { cn, formatDateUK } from '@/lib/utils'
import { formatPence, quoteTypeLabel, QUOTE_STATUS_META, QUOTE_TYPES } from '@/lib/sales'
import type { Quote, QuoteStatus } from '@/lib/types/database'
import { deleteQuote, duplicateQuote } from '@/app/(dashboard)/dashboard/sales/actions'

export function QuotesTable({ quotes }: { quotes: Quote[] }) {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<string>('all')
  const [type, setType] = useState<string>('all')
  const [deleteTarget, setDeleteTarget] = useState<Quote | null>(null)
  const [isPending, startTransition] = useTransition()

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return quotes.filter((quote) => {
      if (status !== 'all' && quote.status !== status) return false
      if (type !== 'all' && quote.quote_type !== type) return false
      if (!q) return true
      const target =
        quote.client?.name ?? quote.prospect_name ?? ''
      return (
        quote.title.toLowerCase().includes(q) ||
        (quote.quote_number ?? '').toLowerCase().includes(q) ||
        target.toLowerCase().includes(q)
      )
    })
  }, [quotes, search, status, type])

  function handleDuplicate(id: string) {
    startTransition(async () => {
      const res = await duplicateQuote(id)
      if (res.ok && res.id) {
        toast.success('Quote duplicated')
        router.push(`/dashboard/sales/${res.id}`)
      } else {
        toast.error(res.error ?? 'Could not duplicate quote')
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
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-wrap items-center gap-3">
          <div className="relative w-full sm:max-w-xs">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search quotes..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8"
            />
          </div>
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
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" asChild>
            <Link href="/dashboard/sales/catalogue">
              <BookOpen className="mr-2 h-4 w-4" />
              Catalogue
            </Link>
          </Button>
          <Button asChild>
            <Link href="/dashboard/sales/new">
              <Plus className="mr-2 h-4 w-4" />
              New Quote
            </Link>
          </Button>
        </div>
      </div>

      <Card>
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
                    <div className="font-medium">{quote.title}</div>
                    <div className="text-xs text-muted-foreground">
                      {quote.quote_number ?? 'Draft'}
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
                        <DropdownMenuItem onClick={() => handleDuplicate(quote.id)} disabled={isPending}>
                          <Copy className="mr-2 h-4 w-4" />
                          Duplicate
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
