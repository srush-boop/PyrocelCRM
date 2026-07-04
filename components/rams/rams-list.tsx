'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Plus, Search, FileText, ShieldCheck, Wrench } from 'lucide-react'
import { formatDateUK } from '@/lib/utils'
import { RAMS_STATUS_META } from '@/lib/rams/risk'
import type { RamsDocument } from '@/lib/rams/types'

interface RamsListProps {
  documents: (RamsDocument & {
    client_name?: string | null
    prepared_by_name?: string | null
  })[]
  canManage: boolean
  canAdmin?: boolean
}

export function RamsList({ documents, canManage, canAdmin }: RamsListProps) {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<string>('all')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return documents.filter((d) => {
      if (status !== 'all' && d.status !== status) return false
      if (!q) return true
      return (
        d.rams_number.toLowerCase().includes(q) ||
        d.title.toLowerCase().includes(q) ||
        (d.client_name || '').toLowerCase().includes(q) ||
        (d.work_location || '').toLowerCase().includes(q)
      )
    })
  }, [documents, query, status])

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search number, title, client..."
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-2">
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="pending_approval">Pending Approval</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
              <SelectItem value="archived">Archived</SelectItem>
            </SelectContent>
          </Select>
          {canAdmin && (
            <Button asChild variant="outline">
              <Link href="/dashboard/rams/admin/equipment">
                <Wrench className="mr-2 h-4 w-4" />
                Equipment
              </Link>
            </Button>
          )}
          {canManage && (
            <Button asChild>
              <Link href="/dashboard/rams/new">
                <Plus className="mr-2 h-4 w-4" />
                New RAMS
              </Link>
            </Button>
          )}
        </div>
      </div>

      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>RAMS Number</TableHead>
              <TableHead>Title</TableHead>
              <TableHead className="hidden md:table-cell">Client</TableHead>
              <TableHead className="hidden lg:table-cell">Location</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="hidden sm:table-cell">Rev</TableHead>
              <TableHead className="hidden lg:table-cell">Updated</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-32 text-center">
                  <div className="flex flex-col items-center justify-center gap-2 text-muted-foreground">
                    <ShieldCheck className="h-8 w-8" />
                    <p>No RAMS documents found</p>
                    {canManage && (
                      <Button asChild variant="outline" size="sm" className="mt-2">
                        <Link href="/dashboard/rams/new">Create your first RAMS</Link>
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((d) => {
                const meta = RAMS_STATUS_META[d.status] || RAMS_STATUS_META.draft
                return (
                  <TableRow
                    key={d.id}
                    className="cursor-pointer"
                    onClick={() => router.push(`/dashboard/rams/${d.id}`)}
                  >
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                        {d.rams_number}
                      </div>
                    </TableCell>
                    <TableCell className="max-w-[240px] truncate">{d.title}</TableCell>
                    <TableCell className="hidden md:table-cell">
                      {d.client_name || '—'}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell max-w-[200px] truncate">
                      {d.work_location || '—'}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={meta.className}>
                        {meta.label}
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      {d.revision ? `Rev ${d.revision}` : '—'}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-muted-foreground">
                      {formatDateUK(d.updated_at)}
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
