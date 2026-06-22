'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { FireExtinguisher, Search } from 'lucide-react'
import { ScanQrButton } from './scan-qr-button'
import { EXTINGUISHER_TYPE_LABELS } from '@/lib/extinguishers'
import { formatDateUK } from '@/lib/utils'
import type { Extinguisher, ExtinguisherResult } from '@/lib/types/database'

type ExtinguisherRow = Extinguisher & { site: { id: string; name: string } | null }

interface ExtinguishersIndexProps {
  extinguishers: ExtinguisherRow[]
}

const RESULT_VARIANT: Record<ExtinguisherResult, 'default' | 'destructive' | 'secondary' | 'outline'> = {
  pass: 'default',
  fail: 'destructive',
  remedial: 'secondary',
  na: 'outline',
}

export function ExtinguishersIndex({ extinguishers }: ExtinguishersIndexProps) {
  const [search, setSearch] = useState('')

  const filtered = extinguishers.filter((e) => {
    const q = search.toLowerCase()
    return (
      e.urn.toLowerCase().includes(q) ||
      (e.reference || '').toLowerCase().includes(q) ||
      (e.location || '').toLowerCase().includes(q) ||
      (e.serial_number || '').toLowerCase().includes(q) ||
      (e.site?.name || '').toLowerCase().includes(q)
    )
  })

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Fire Extinguishers</h1>
          <p className="text-sm text-muted-foreground">
            All portable fire extinguishers across every site
          </p>
        </div>
        <ScanQrButton variant="default" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FireExtinguisher className="h-5 w-5" />
            {extinguishers.length} Extinguisher{extinguishers.length === 1 ? '' : 's'}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search URN, serial, location, site…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>URN</TableHead>
                  <TableHead>Site</TableHead>
                  <TableHead className="hidden sm:table-cell">Location</TableHead>
                  <TableHead className="hidden md:table-cell">Type</TableHead>
                  <TableHead>Latest</TableHead>
                  <TableHead className="hidden lg:table-cell">Last Serviced</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                      No extinguishers found.
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((extinguisher) => (
                    <TableRow key={extinguisher.id}>
                      <TableCell>
                        <Link
                          href={`/dashboard/extinguishers/${extinguisher.urn}`}
                          className="font-mono font-medium text-primary hover:underline"
                        >
                          {extinguisher.urn}
                        </Link>
                      </TableCell>
                      <TableCell>
                        {extinguisher.site ? (
                          <Link
                            href={`/dashboard/sites/${extinguisher.site.id}`}
                            className="hover:underline"
                          >
                            {extinguisher.site.name}
                          </Link>
                        ) : (
                          '-'
                        )}
                      </TableCell>
                      <TableCell className="hidden max-w-[200px] truncate sm:table-cell">
                        {extinguisher.location || '-'}
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        {EXTINGUISHER_TYPE_LABELS[extinguisher.extinguisher_type]}
                      </TableCell>
                      <TableCell>
                        {extinguisher.latest_result ? (
                          <Badge
                            variant={RESULT_VARIANT[extinguisher.latest_result]}
                            className="capitalize"
                          >
                            {extinguisher.latest_result}
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">Not serviced</span>
                        )}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">
                        {extinguisher.last_inspected_date
                          ? formatDateUK(extinguisher.last_inspected_date)
                          : '-'}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
