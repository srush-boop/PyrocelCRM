'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ScrollArea } from '@/components/ui/scroll-area'
import { History, ArrowRight } from 'lucide-react'
import { formatDateTimeUK } from '@/lib/utils'
import { formatShiftDate, type ChangeLogEntry } from '@/lib/oncall/types'

export function ChangeLogTable({ entries }: { entries: ChangeLogEntry[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <History className="h-5 w-5" />
          Swap &amp; change log
        </CardTitle>
      </CardHeader>
      <CardContent>
        {entries.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No changes recorded.</p>
        ) : (
          <ScrollArea className="max-h-[32rem]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Branch</TableHead>
                  <TableHead>Shift</TableHead>
                  <TableHead>Change</TableHead>
                  <TableHead>By</TableHead>
                  <TableHead>Reason</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {formatDateTimeUK(e.createdAt)}
                    </TableCell>
                    <TableCell className="text-sm">{e.branchName}</TableCell>
                    <TableCell className="whitespace-nowrap text-sm">
                      {e.shiftDate ? formatShiftDate(e.shiftDate) : '—'}
                    </TableCell>
                    <TableCell className="text-sm">
                      <span className="flex items-center gap-1.5">
                        <span className={e.fromEngineerName ? '' : 'text-muted-foreground'}>
                          {e.fromEngineerName ?? 'Unassigned'}
                        </span>
                        <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className={e.toEngineerName ? '' : 'text-muted-foreground'}>
                          {e.toEngineerName ?? 'Unassigned'}
                        </span>
                      </span>
                    </TableCell>
                    <TableCell className="text-sm">{e.changedByName ?? '—'}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{e.reason ?? '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  )
}
