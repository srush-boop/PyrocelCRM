'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card } from '@/components/ui/card'
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
import { Hammer } from 'lucide-react'
import { GridSearch } from '@/components/dashboard/grid-header'
import { cn } from '@/lib/utils'
import { formatPence } from '@/lib/sales'
import { JOB_STAGES, JOB_STATUSES, jobStageMeta, jobStatusMeta } from '@/lib/jobs/stages'
import { jobFinance } from '@/lib/jobs/finance'
import type { Job } from '@/lib/types/database'

export function JobsTable({ jobs }: { jobs: Job[] }) {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [stage, setStage] = useState('all')
  const [status, setStatus] = useState('all')
  const [owner, setOwner] = useState('all')
  const [department, setDepartment] = useState('all')

  // Distinct owners / departments present in the current job set, for filters.
  const owners = useMemo(() => {
    const map = new Map<string, string>()
    for (const job of jobs) {
      if (job.owner?.id && job.owner.full_name) map.set(job.owner.id, job.owner.full_name)
    }
    return Array.from(map, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name))
  }, [jobs])

  const departments = useMemo(() => {
    const map = new Map<string, string>()
    for (const job of jobs) {
      const dep = job as Job & { department?: { id: string; name: string } | null }
      if (dep.department?.id && dep.department.name) map.set(dep.department.id, dep.department.name)
    }
    return Array.from(map, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name))
  }, [jobs])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return jobs.filter((job) => {
      if (stage !== 'all' && job.stage !== stage) return false
      if (status !== 'all' && job.status !== status) return false
      if (owner !== 'all' && job.owner?.id !== owner) return false
      if (department !== 'all' && job.department_id !== department) return false
      if (!q) return true
      return (
        (job.job_number ?? '').toLowerCase().includes(q) ||
        (job.title ?? '').toLowerCase().includes(q) ||
        (job.client?.name ?? '').toLowerCase().includes(q) ||
        (job.site?.name ?? '').toLowerCase().includes(q) ||
        (job.owner?.full_name ?? '').toLowerCase().includes(q)
      )
    })
  }, [jobs, search, stage, status, owner, department])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <GridSearch
          value={search}
          onChange={setSearch}
          placeholder="Search jobs..."
          className="w-full sm:max-w-xs"
        />
        <Select value={stage} onValueChange={setStage}>
          <SelectTrigger className="w-[170px]">
            <SelectValue placeholder="Stage" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All stages</SelectItem>
            {JOB_STAGES.map((s) => (
              <SelectItem key={s.key} value={s.key}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {JOB_STATUSES.map((s) => (
              <SelectItem key={s.key} value={s.key}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {owners.length > 0 && (
          <Select value={owner} onValueChange={setOwner}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Project manager" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All PMs</SelectItem>
              {owners.map((o) => (
                <SelectItem key={o.id} value={o.id}>
                  {o.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {departments.length > 0 && (
          <Select value={department} onValueChange={setDepartment}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Department" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All departments</SelectItem>
              {departments.map((d) => (
                <SelectItem key={d.id} value={d.id}>
                  {d.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      <Card>
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 p-12 text-center">
            <Hammer className="h-8 w-8 text-muted-foreground" />
            <p className="font-medium">No jobs found</p>
            <p className="text-sm text-muted-foreground">
              {jobs.length === 0
                ? 'Jobs are created automatically when a quote is accepted.'
                : 'Try adjusting your search or filters.'}
            </p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Job</TableHead>
                <TableHead>Client / Site</TableHead>
                <TableHead>Stage</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Project manager</TableHead>
                <TableHead>Branch</TableHead>
                <TableHead className="text-right">Value</TableHead>
                <TableHead className="text-right">Margin</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((job) => {
                const stageMeta = jobStageMeta(job.stage)
                const statusMeta = jobStatusMeta(job.status)
                const fin = jobFinance(job)
                return (
                  <TableRow
                    key={job.id}
                    className="cursor-pointer"
                    onClick={() => router.push(`/dashboard/jobs/${job.id}`)}
                  >
                    <TableCell>
                      <div className="font-medium">{job.title ?? 'Untitled job'}</div>
                      <div className="text-xs text-muted-foreground">{job.job_number ?? '—'}</div>
                    </TableCell>
                    <TableCell>
                      {job.client?.name ?? '—'}
                      {job.site?.name && (
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          {job.site.name}
                          {job.site.status === 'new' && (
                            <Badge variant="outline" className="border-amber-500/40 text-[10px] text-amber-700 dark:text-amber-300">
                              Off-contract
                            </Badge>
                          )}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{stageMeta.label}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className={cn(statusMeta.badgeClass)}>
                        {statusMeta.label}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {job.owner?.full_name ?? '—'}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {job.branch?.name ?? '—'}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {formatPence(fin.valuePence)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      <div className="font-medium">{formatPence(fin.quotedMarginPence)}</div>
                      {fin.quotedMarginPercent !== null && (
                        <div className="text-xs text-muted-foreground">{fin.quotedMarginPercent}%</div>
                      )}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  )
}
