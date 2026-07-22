'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Loader2, Plus, Pencil, Trash2 } from 'lucide-react'
import {
  createChargeTemplate,
  updateChargeTemplate,
  deleteChargeTemplate,
} from '@/lib/actions/charge-templates'
import type { ChargeTemplate, NominalCode } from '@/lib/types/database'
import { NominalCodeSelect } from '@/components/dashboard/billing/nominal-code-select'

interface ChargeTemplatesSettingsProps {
  chargeTemplates: ChargeTemplate[]
  nominalCodes: NominalCode[]
}

interface FormState {
  id?: string
  name: string
  description: string
  pricePounds: string
  nominalCodeId: string | null
  active: boolean
}

function emptyForm(): FormState {
  return {
    name: '',
    description: '',
    pricePounds: '',
    nominalCodeId: null,
    active: true,
  }
}

const poundsFromPence = (pence: number) => (pence / 100).toFixed(2)
const penceFromPounds = (pounds: string) =>
  Math.max(0, Math.round((Number.parseFloat(pounds) || 0) * 100))
const formatPence = (pence: number) =>
  new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(pence / 100)

export function ChargeTemplatesSettings({
  chargeTemplates,
  nominalCodes,
}: ChargeTemplatesSettingsProps) {
  const router = useRouter()
  const codeLabel = (id: string | null) => {
    const c = id ? nominalCodes.find((n) => n.id === id) : null
    return c ? `${c.code} — ${c.name}` : null
  }
  const [isPending, startTransition] = useTransition()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [form, setForm] = useState<FormState>(emptyForm())
  const [deleteTarget, setDeleteTarget] = useState<ChargeTemplate | null>(null)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  function openCreate() {
    setForm(emptyForm())
    setMessage(null)
    setDialogOpen(true)
  }

  function openEdit(t: ChargeTemplate) {
    setForm({
      id: t.id,
      name: t.name,
      description: t.description ?? '',
      pricePounds: poundsFromPence(t.default_unit_price_pence),
      nominalCodeId: t.nominal_code_id ?? null,
      active: t.active,
    })
    setMessage(null)
    setDialogOpen(true)
  }

  function handleSave() {
    if (!form.name.trim()) {
      setMessage({ type: 'error', text: 'A name is required.' })
      return
    }
    const payload = {
      name: form.name,
      description: form.description,
      defaultUnitPricePence: penceFromPounds(form.pricePounds),
      nominalCodeId: form.nominalCodeId,
      active: form.active,
    }
    startTransition(async () => {
      const res = form.id
        ? await updateChargeTemplate(form.id, payload)
        : await createChargeTemplate(payload)
      if (res.error) {
        setMessage({ type: 'error', text: res.error })
        return
      }
      setDialogOpen(false)
      router.refresh()
    })
  }

  function handleDelete() {
    if (!deleteTarget) return
    const target = deleteTarget
    startTransition(async () => {
      const res = await deleteChargeTemplate(target.id)
      setDeleteTarget(null)
      if (res.error) {
        setMessage({ type: 'error', text: res.error })
        return
      }
      router.refresh()
    })
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle>Charges</CardTitle>
          <CardDescription>
            A catalog of preconfigured charges. Pick one when adding a recurring charge to a site
            service to prefill its description, price and codes — all still editable per site.
          </CardDescription>
        </div>
        <Button onClick={openCreate} className="gap-2">
          <Plus className="h-4 w-4" />
          Add charge
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {message && (
          <div
            className={`rounded-lg p-3 text-sm ${
              message.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'
            }`}
          >
            {message.text}
          </div>
        )}

        {chargeTemplates.length === 0 ? (
          <p className="rounded-md border py-8 text-center text-sm text-muted-foreground">
            No charges yet. Add one to build your reusable catalog.
          </p>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Default price</TableHead>
                  <TableHead>Nominal</TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {chargeTemplates.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{t.name}</span>
                        {!t.active && <Badge variant="secondary">Inactive</Badge>}
                      </div>
                      {t.description && (
                        <p className="text-xs text-muted-foreground">{t.description}</p>
                      )}
                    </TableCell>
                    <TableCell>{formatPence(t.default_unit_price_pence)}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {codeLabel(t.nominal_code_id) || t.default_nominal_code || '—'}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openEdit(t)}
                          aria-label={`Edit ${t.name}`}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setDeleteTarget(t)}
                          aria-label={`Delete ${t.name}`}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{form.id ? 'Edit charge' : 'Add charge'}</DialogTitle>
            <DialogDescription>
              These defaults prefill a recurring charge when this catalog item is picked. They can
              be overridden per site service.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-1.5">
              <Label htmlFor="ct-name">Name</Label>
              <Input
                id="ct-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Fire alarm maintenance contract"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="ct-desc">Description</Label>
              <Textarea
                id="ct-desc"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                rows={2}
                placeholder="Optional line description used on the invoice."
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="grid gap-1.5">
                <Label htmlFor="ct-price">Default price (£)</Label>
                <Input
                  id="ct-price"
                  type="number"
                  min={0}
                  step={0.01}
                  inputMode="decimal"
                  value={form.pricePounds}
                  onChange={(e) => setForm({ ...form, pricePounds: e.target.value })}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="ct-nominal">Nominal code</Label>
                <NominalCodeSelect
                  id="ct-nominal"
                  value={form.nominalCodeId}
                  onChange={(id) => setForm({ ...form, nominalCodeId: id })}
                  codes={nominalCodes}
                  noneLabel="None"
                />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.active}
                onChange={(e) => setForm({ ...form, active: e.target.checked })}
                className="h-4 w-4 rounded border-input"
              />
              Active (available to pick)
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={isPending}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={isPending}>
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {form.id ? 'Save changes' : 'Create charge'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleteTarget?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the catalog item. Recurring charges already created from it are not
              affected. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                handleDelete()
              }}
              disabled={isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}
