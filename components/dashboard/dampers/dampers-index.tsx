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
import { Wind, Search } from 'lucide-react'
import { ScanQrButton } from './scan-qr-button'
import { DAMPER_TYPE_LABELS } from '@/lib/dampers'
import { formatDateUK } from '@/lib/utils'
import type { Damper, DamperResult } from '@/lib/types/database'

type DamperRow = Damper & { site: { id: string; name: string } | null }

interface DampersIndexProps {
  dampers: DamperRow[]
}

const RESULT_VARIANT: Record<DamperResult, 'default' | 'destructive' | 'secondary' | 'outline'> = {
  pass: 'default',
  fail: 'destructive',
  remedial: 'secondary',
  na: 'outline',
}

export function DampersIndex({ dampers }: DampersIndexProps) {
  const [search, setSearch] = useState('')

  const filtered = dampers.filter((d) => {
    const q = search.toLowerCase()
    return (
      d.urn.toLowerCase().includes(q) ||
      (d.reference || '').toLowerCase().includes(q) ||
      (d.location || '').toLowerCase().includes(q) ||
      (d.site?.name || '').toLowerCase().includes(q)
    )
  })

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Dampers</h1>
          <p className="text-sm text-muted-foreground">
            All fire &amp; smoke dampers across every site
          </p>
        </div>
        <ScanQrButton variant="default" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wind className="h-5 w-5" />
            {dampers.length} Damper{dampers.length === 1 ? '' : 's'}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search URN, reference, site…"
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
                  <TableHead className="hidden lg:table-cell">Last Inspected</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                      No dampers found.
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((damper) => (
                    <TableRow key={damper.id}>
                      <TableCell>
                        <Link
                          href={`/dashboard/dampers/${damper.urn}`}
                          className="font-mono font-medium text-primary hover:underline"
                        >
                          {damper.urn}
                        </Link>
                      </TableCell>
                      <TableCell>
                        {damper.site ? (
                          <Link
                            href={`/dashboard/sites/${damper.site.id}`}
                            className="hover:underline"
                          >
                            {damper.site.name}
                          </Link>
                        ) : (
                          '-'
                        )}
                      </TableCell>
                      <TableCell className="hidden max-w-[200px] truncate sm:table-cell">
                        {damper.location || '-'}
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        {DAMPER_TYPE_LABELS[damper.damper_type]}
                      </TableCell>
                      <TableCell>
                        {damper.latest_result ? (
                          <Badge variant={RESULT_VARIANT[damper.latest_result]} className="capitalize">
                            {damper.latest_result}
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">Not tested</span>
                        )}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">
                        {damper.last_inspected_date ? formatDateUK(damper.last_inspected_date) : '-'}
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
