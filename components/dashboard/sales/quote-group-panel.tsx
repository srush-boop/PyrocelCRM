'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Copy, GitBranch, Loader2, Check } from 'lucide-react'
import { toast } from 'sonner'
import { formatPence, QUOTE_STATUS_META } from '@/lib/sales'
import type { QuoteStatus } from '@/lib/types/database'
import {
  cloneQuoteForContractor,
  createRevision,
} from '@/app/(dashboard)/dashboard/sales/actions'

export interface QuoteGroupMember {
  id: string
  quote_number: string | null
  reference: string | null
  revision: number
  variant_label: string | null
  is_master: boolean
  status: QuoteStatus
  total_pence: number
  master_quote_id: string | null
}

interface QuoteGroupPanelProps {
  currentId: string
  members: QuoteGroupMember[]
}

export function QuoteGroupPanel({ currentId, members }: QuoteGroupPanelProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [cloneOpen, setCloneOpen] = useState(false)
  const [variantLabel, setVariantLabel] = useState('')

  const reference = members.find((m) => m.reference)?.reference ?? null
  // Sort: master first, then by variant label, then revision.
  const sorted = [...members].sort((a, b) => {
    if (a.is_master !== b.is_master) return a.is_master ? -1 : 1
    const va = a.variant_label ?? ''
    const vb = b.variant_label ?? ''
    if (va !== vb) return va.localeCompare(vb)
    return a.revision - b.revision
  })

  function handleClone() {
    if (!variantLabel.trim()) {
      toast.error('Enter a contractor or variant label')
      return
    }
    startTransition(async () => {
      const res = await cloneQuoteForContractor(currentId, variantLabel.trim())
      if (res.ok && res.id) {
        toast.success('Cloned for contractor')
        setCloneOpen(false)
        setVariantLabel('')
        router.push(`/dashboard/sales/${res.id}`)
      } else {
        toast.error(res.error ?? 'Could not clone quote')
      }
    })
  }

  function handleRevision() {
    startTransition(async () => {
      const res = await createRevision(currentId)
      if (res.ok && res.id) {
        toast.success('New revision created')
        router.push(`/dashboard/sales/${res.id}`)
      } else {
        toast.error(res.error ?? 'Could not create revision')
      }
    })
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <div>
          <CardTitle className="text-base">Reference {reference ?? '—'}</CardTitle>
          <p className="text-sm text-muted-foreground">
            Contractor variants and revisions share this reference.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setCloneOpen(true)} disabled={isPending}>
            <Copy className="mr-2 h-4 w-4" />
            Clone for contractor
          </Button>
          <Button variant="outline" size="sm" onClick={handleRevision} disabled={isPending}>
            {isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <GitBranch className="mr-2 h-4 w-4" />
            )}
            New revision
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <ul className="divide-y rounded-md border">
          {sorted.map((m) => {
            const isCurrent = m.id === currentId
            const meta = QUOTE_STATUS_META[m.status]
            return (
              <li key={m.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                <div className="flex min-w-0 items-center gap-2">
                  {isCurrent ? (
                    <Check className="h-4 w-4 shrink-0 text-primary" />
                  ) : (
                    <span className="h-4 w-4 shrink-0" />
                  )}
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-medium">
                        {m.is_master ? 'Master' : m.variant_label || 'Variant'}
                      </span>
                      {m.revision > 0 && (
                        <Badge variant="outline" className="text-xs">
                          Rev {m.revision}
                        </Badge>
                      )}
                      <Badge className={`text-xs ${meta.badgeClass}`} variant="secondary">
                        {meta.label}
                      </Badge>
                    </div>
                    <p className="truncate text-xs text-muted-foreground">
                      {m.quote_number ?? 'Draft'} · {formatPence(m.total_pence)}
                    </p>
                  </div>
                </div>
                {isCurrent ? (
                  <span className="shrink-0 text-xs text-muted-foreground">Viewing</span>
                ) : (
                  <Button asChild variant="ghost" size="sm">
                    <Link href={`/dashboard/sales/${m.id}`}>Open</Link>
                  </Button>
                )}
              </li>
            )
          })}
        </ul>
      </CardContent>

      <Dialog open={cloneOpen} onOpenChange={setCloneOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Clone for contractor</DialogTitle>
            <DialogDescription>
              Creates a copy under the same reference, labelled for an alternate contractor or
              client. Edit its pricing independently.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2 py-2">
            <Label htmlFor="variant-label">Contractor / variant label</Label>
            <Input
              id="variant-label"
              value={variantLabel}
              onChange={(e) => setVariantLabel(e.target.value)}
              placeholder="e.g. ABC Contractors Ltd"
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCloneOpen(false)} disabled={isPending}>
              Cancel
            </Button>
            <Button onClick={handleClone} disabled={isPending}>
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create clone
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
