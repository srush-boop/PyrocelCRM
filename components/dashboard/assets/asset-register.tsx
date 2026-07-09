'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
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
import { Search } from 'lucide-react'
import { formatCurrency, type DueStatus } from '@/lib/assets'
import type { Asset, AssetCategory } from '@/lib/types/database'

type DueMap = Record<string, DueStatus>

interface AssetRegisterProps {
  assets: Asset[]
  categories: AssetCategory[]
  dueByAsset: DueMap
}

const DUE_BADGE: Record<DueStatus, { label: string; variant: 'default' | 'destructive' | 'secondary' | 'outline' }> =
  {
    ok: { label: 'Up to date', variant: 'default' },
    due_soon: { label: 'Due soon', variant: 'secondary' },
    overdue: { label: 'Overdue', variant: 'destructive' },
    none: { label: 'No checks', variant: 'outline' },
  }

export function AssetRegister({ assets, categories, dueByAsset }: AssetRegisterProps) {
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('all')
  const [status, setStatus] = useState('active')
  const [location, setLocation] = useState('all')

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return assets.filter((a) => {
      if (status !== 'all' && a.status !== status) return false
      if (category !== 'all' && a.category_id !== category) return false
      if (location === 'assigned' && !a.assigned_to) return false
      if (location === 'stored' && a.assigned_to) return false
      if (!q) return true
      return (
        a.name.toLowerCase().includes(q) ||
        a.urn.toLowerCase().includes(q) ||
        (a.sage_reference || '').toLowerCase().includes(q) ||
        (a.serial_number || '').toLowerCase().includes(q) ||
        (a.holder?.full_name || '').toLowerCase().includes(q) ||
        (a.storage_location || '').toLowerCase().includes(q)
      )
    })
  }, [assets, search, category, status, location])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search name, URN, SAGE ref, serial, holder…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={location} onValueChange={setLocation}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Location" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Anywhere</SelectItem>
            <SelectItem value="assigned">Assigned</SelectItem>
            <SelectItem value="stored">In storage</SelectItem>
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-[130px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="disposed">Disposed</SelectItem>
            <SelectItem value="all">All</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Asset</TableHead>
              <TableHead className="hidden sm:table-cell">Category</TableHead>
              <TableHead>Holder / Location</TableHead>
              <TableHead className="hidden lg:table-cell">Value</TableHead>
              <TableHead>Checks</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                  No assets found.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((a) => {
                const due = DUE_BADGE[dueByAsset[a.id] ?? 'none']
                return (
                  <TableRow key={a.id}>
                    <TableCell>
                      <Link
                        href={`/dashboard/assets/${a.urn}`}
                        className="font-medium text-primary hover:underline"
                      >
                        {a.name}
                      </Link>
                      <div className="font-mono text-xs text-muted-foreground">
                        {a.urn}
                        {a.sage_reference ? ` · SAGE ${a.sage_reference}` : ''}
                      </div>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <span className="text-sm">{a.category?.name || '—'}</span>
                      {a.is_test_equipment && (
                        <Badge variant="outline" className="ml-1 text-[10px]">
                          Test
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {a.status === 'disposed' ? (
                        <span className="text-sm text-muted-foreground">Disposed</span>
                      ) : a.holder ? (
                        <span className="text-sm">{a.holder.full_name || a.holder.email}</span>
                      ) : (
                        <span className="text-sm text-muted-foreground">
                          {a.storage_location || 'In storage'}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">
                      {formatCurrency(a.value)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={due.variant}>{due.label}</Badge>
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
