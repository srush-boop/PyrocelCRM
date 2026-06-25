'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Search, Eye, FileText } from 'lucide-react'
import { formatDateUK } from '@/lib/utils'

export interface PortalReport {
  id: string
  taskId: string
  referenceNumber: string
  siteName: string
  serviceName: string
  overallStatus: 'pass' | 'partial' | 'fail' | string | null
  completedAt: string | null
}

function StatusBadge({ status }: { status: PortalReport['overallStatus'] }) {
  if (status === 'pass') {
    return <Badge className="bg-green-600 text-white hover:bg-green-600/90">Pass</Badge>
  }
  if (status === 'partial') {
    return <Badge className="bg-amber-500 text-white hover:bg-amber-500/90">Partial</Badge>
  }
  if (status === 'fail') {
    return <Badge variant="destructive">Fail</Badge>
  }
  return <Badge variant="secondary">—</Badge>
}

export function PortalReportsList({ reports }: { reports: PortalReport[] }) {
  const [search, setSearch] = useState('')
  const [site, setSite] = useState('all')

  const siteOptions = useMemo(() => {
    const names = Array.from(new Set(reports.map((r) => r.siteName))).sort()
    return names
  }, [reports])

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return reports.filter((r) => {
      if (site !== 'all' && r.siteName !== site) return false
      if (!q) return true
      return (
        r.referenceNumber.toLowerCase().includes(q) ||
        r.siteName.toLowerCase().includes(q) ||
        r.serviceName.toLowerCase().includes(q)
      )
    })
  }, [reports, search, site])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search reports..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        {siteOptions.length > 1 && (
          <Select value={site} onValueChange={setSite}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="All sites" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All sites</SelectItem>
              {siteOptions.map((name) => (
                <SelectItem key={name} value={name}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      <div className="rounded-md border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Reference</TableHead>
              <TableHead>Site</TableHead>
              <TableHead>Service</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-[100px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center">
                  <div className="flex flex-col items-center justify-center">
                    <FileText className="mb-2 h-8 w-8 text-muted-foreground/50" />
                    <p className="text-muted-foreground">No reports found</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((report) => (
                <TableRow key={report.id}>
                  <TableCell className="font-mono text-sm font-medium">
                    {report.referenceNumber}
                  </TableCell>
                  <TableCell>{report.siteName}</TableCell>
                  <TableCell className="text-muted-foreground">{report.serviceName}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {report.completedAt ? formatDateUK(report.completedAt) : '-'}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={report.overallStatus} />
                  </TableCell>
                  <TableCell>
                    <Button size="sm" variant="outline" asChild className="gap-2">
                      <Link href={`/portal/reports/${report.taskId}`}>
                        <Eye className="h-4 w-4" />
                        View
                      </Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
