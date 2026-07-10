'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Search, AlertTriangle, ChevronRight, Package } from 'lucide-react'
import { PrintButton } from '@/components/ui/print-button'
import { formatDateUK } from '@/lib/utils'
import { DEFECT_STATUS_LABELS } from '@/lib/defects'
import type { DefectStatus } from '@/lib/types/database'

export interface DefectRow {
  id: string
  taskId: string | null
  referenceNumber: string | null
  failedCount: number
  advisoryCount: number
  status: DefectStatus
  quoteId: string | null
  createdAt: string
  resolvedAt: string | null
  siteName: string
  clientName: string
  serviceName: string
  suggestedPartsCount: number
}

const STATUS_VARIANT: Record<DefectStatus, 'destructive' | 'secondary' | 'default' | 'outline'> = {
  open: 'destructive',
  quoted: 'secondary',
  resolved: 'default',
  dismissed: 'outline',
}

export function DefectsTable({ defects }: { defects: DefectRow[] }) {
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<string>('open')

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return defects.filter((d) => {
      if (status !== 'all' && d.status !== status) return false
      if (!q) return true
      return (
        (d.referenceNumber ?? '').toLowerCase().includes(q) ||
        d.siteName.toLowerCase().includes(q) ||
        d.clientName.toLowerCase().includes(q) ||
        d.serviceName.toLowerCase().includes(q)
      )
    })
  }, [defects, search, status])

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 p-4 md:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search reference, site, client or service"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8"
            />
          </div>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-full sm:w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="open">Open</SelectItem>
              <SelectItem value="quoted">Quoted</SelectItem>
              <SelectItem value="resolved">Resolved</SelectItem>
              <SelectItem value="dismissed">Dismissed</SelectItem>
            </SelectContent>
          </Select>
          <PrintButton targetId="defects-grid" title="Defects" />
        </div>

        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
            <AlertTriangle className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm font-medium">No defects found</p>
            <p className="text-sm text-muted-foreground">
              Failed reports and advisories will appear here automatically.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table id="defects-grid">
              <TableHeader>
                <TableRow>
                  <TableHead>Reference</TableHead>
                  <TableHead>Site</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Service</TableHead>
                  <TableHead className="text-center">Failures</TableHead>
                  <TableHead className="text-center">Advisories</TableHead>
                  <TableHead className="text-center">Parts</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Logged</TableHead>
                  <TableHead className="sr-only">View</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((d) => (
                  <TableRow key={d.id} className="cursor-pointer">
                    <TableCell className="font-medium">
                      <Link href={`/dashboard/defects/${d.id}`} className="hover:underline">
                        {d.referenceNumber ?? '—'}
                      </Link>
                    </TableCell>
                    <TableCell>{d.siteName}</TableCell>
                    <TableCell>{d.clientName}</TableCell>
                    <TableCell>{d.serviceName}</TableCell>
                    <TableCell className="text-center">
                      {d.failedCount > 0 ? (
                        <Badge variant="destructive">{d.failedCount}</Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      {d.advisoryCount > 0 ? (
                        <Badge className="bg-amber-500 text-white hover:bg-amber-600">
                          {d.advisoryCount}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      {d.suggestedPartsCount > 0 ? (
                        <span
                          className="inline-flex items-center gap-1 text-sm text-muted-foreground"
                          title={`${d.suggestedPartsCount} suggested part${d.suggestedPartsCount === 1 ? '' : 's'} (internal)`}
                        >
                          <Package className="h-3.5 w-3.5" />
                          {d.suggestedPartsCount}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANT[d.status]}>
                        {DEFECT_STATUS_LABELS[d.status]}
                      </Badge>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {formatDateUK(d.createdAt)}
                    </TableCell>
                    <TableCell>
                      <Link
                        href={`/dashboard/defects/${d.id}`}
                        className="flex items-center justify-end text-muted-foreground hover:text-foreground"
                        aria-label="View defect"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
