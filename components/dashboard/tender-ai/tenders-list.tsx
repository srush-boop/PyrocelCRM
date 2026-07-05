'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'
import { Plus, Loader2, FileSignature, ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { TENDER_STATUS_META, type Tender, type TenderStatus } from '@/lib/tender/types'

const STATUS_STYLES: Record<TenderStatus, string> = {
  draft: 'bg-muted text-muted-foreground',
  in_progress: 'bg-chart-1/15 text-foreground',
  submitted: 'bg-chart-4/15 text-foreground',
  won: 'bg-chart-2/20 text-foreground',
  lost: 'bg-destructive/10 text-destructive',
}

export function TendersList({ tenders }: { tenders: Tender[] }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ title: '', client_name: '', reference: '', due_date: '' })

  const create = useCallback(async () => {
    if (!form.title.trim()) {
      toast.error('A tender title is required')
      return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/tender/tenders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: form.title.trim(),
          client_name: form.client_name.trim() || null,
          reference: form.reference.trim() || null,
          due_date: form.due_date || null,
        }),
      })
      if (!res.ok) throw new Error('Failed to create tender')
      const { tender } = await res.json()
      toast.success('Tender created')
      setOpen(false)
      router.push(`/dashboard/tender-ai/tenders/${tender.id}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create tender')
    } finally {
      setSaving(false)
    }
  }, [form, router])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Button onClick={() => setOpen(true)}>
          <Plus className="size-4" />
          New tender
        </Button>
      </div>

      {tenders.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <div className="flex size-12 items-center justify-center rounded-full bg-muted">
              <FileSignature className="size-6 text-muted-foreground" />
            </div>
            <div>
              <p className="font-medium">No tenders yet</p>
              <p className="text-sm text-muted-foreground text-pretty">
                Create your first tender to start drafting AI-assisted answers.
              </p>
            </div>
            <Button variant="outline" onClick={() => setOpen(true)}>
              <Plus className="size-4" />
              New tender
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {tenders.map((t) => (
            <Link key={t.id} href={`/dashboard/tender-ai/tenders/${t.id}`}>
              <Card className="transition-colors hover:border-primary/40 hover:bg-accent/40">
                <CardContent className="flex items-center justify-between gap-4 py-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="truncate font-medium">{t.title}</h3>
                      <Badge className={STATUS_STYLES[t.status]} variant="secondary">
                        {TENDER_STATUS_META[t.status].label}
                      </Badge>
                    </div>
                    <p className="mt-0.5 truncate text-sm text-muted-foreground">
                      {[t.client_name, t.reference].filter(Boolean).join(' · ') || 'No client set'}
                      {t.due_date && ` · Due ${new Date(t.due_date).toLocaleDateString()}`}
                    </p>
                  </div>
                  <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New tender</DialogTitle>
            <DialogDescription>Set up a tender, then add its questions inside.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="t-title">Title</Label>
              <Input
                id="t-title"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="e.g. City Council Fire Safety Framework"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="t-client">Client</Label>
                <Input
                  id="t-client"
                  value={form.client_name}
                  onChange={(e) => setForm((f) => ({ ...f, client_name: e.target.value }))}
                  placeholder="Client name"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="t-ref">Reference</Label>
                <Input
                  id="t-ref"
                  value={form.reference}
                  onChange={(e) => setForm((f) => ({ ...f, reference: e.target.value }))}
                  placeholder="Ref no."
                />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="t-due">Due date</Label>
              <Input
                id="t-due"
                type="date"
                value={form.due_date}
                onChange={(e) => setForm((f) => ({ ...f, due_date: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={create} disabled={saving}>
              {saving && <Loader2 className="size-4 animate-spin" />}
              Create tender
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
