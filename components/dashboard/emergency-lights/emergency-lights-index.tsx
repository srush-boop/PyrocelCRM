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
import { Lightbulb, Search } from 'lucide-react'
import { formatDateUK } from '@/lib/utils'
import type { EmergencyLight, EmergencyLightResult } from '@/lib/types/database'

type EmergencyLightRow = EmergencyLight & { site: { id: string; name: string } | null }

interface EmergencyLightsIndexProps {
  emergencyLights: EmergencyLightRow[]
}

const RESULT_VARIANT: Record<EmergencyLightResult, 'default' | 'destructive' | 'secondary' | 'outline'> = {
  pass: 'default',
  fail: 'destructive',
  remedial: 'secondary',
  na: 'outline',
}

export function EmergencyLightsIndex({ emergencyLights }: EmergencyLightsIndexProps) {
  const [search, setSearch] = useState('')

  const filtered = emergencyLights.filter((el) => {
    const q = search.toLowerCase()
    return (
      (el.urn || '').toLowerCase().includes(q) ||
      (el.map_reference || '').toLowerCase().includes(q) ||
      (el.location || '').toLowerCase().includes(q) ||
      (el.fitting_type || '').toLowerCase().includes(q) ||
      (el.site?.name || '').toLowerCase().includes(q)
    )
  })

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Emergency Lights</h1>
          <p className="text-sm text-muted-foreground">
            All emergency lighting fittings across every site
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lightbulb className="h-5 w-5" />
            {emergencyLights.length} Emergency Light{emergencyLights.length === 1 ? '' : 's'}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search URN, reference, location, site…"
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
                  <TableHead className="hidden md:table-cell">Floor</TableHead>
                  <TableHead className="hidden md:table-cell">Fitting Type</TableHead>
                  <TableHead>Latest</TableHead>
                  <TableHead className="hidden lg:table-cell">Last Inspected</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                      No emergency lights found.
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((el) => (
                    <TableRow key={el.id}>
                      <TableCell className="font-mono font-medium">{el.urn || '-'}</TableCell>
                      <TableCell>
                        {el.site ? (
                          <Link
                            href={`/dashboard/sites/${el.site.id}`}
                            className="hover:underline"
                          >
                            {el.site.name}
                          </Link>
                        ) : (
                          '-'
                        )}
                      </TableCell>
                      <TableCell className="hidden max-w-[200px] truncate sm:table-cell">
                        {el.location || '-'}
                      </TableCell>
                      <TableCell className="hidden md:table-cell">{el.floor || '-'}</TableCell>
                      <TableCell className="hidden md:table-cell">{el.fitting_type || '-'}</TableCell>
                      <TableCell>
                        {el.latest_result ? (
                          <Badge variant={RESULT_VARIANT[el.latest_result]} className="capitalize">
                            {el.latest_result}
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">Not tested</span>
                        )}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">
                        {el.last_inspected_date ? formatDateUK(el.last_inspected_date) : '-'}
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
