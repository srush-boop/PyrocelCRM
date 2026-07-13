'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
  createNominalCode,
  updateNominalCode,
  deleteNominalCode,
} from '@/lib/actions/nominal-codes'
import type { NominalCode } from '@/lib/types/database'

interface NominalCodesSettingsProps {
  nominalCodes: NominalCode[]
}

interface FormState {
  id?: string
  code: string
  name: string
  active: boolean
}

function emptyForm(): FormState {
  return { code: '', name: '', active: true }
}

export function NominalCodesSettings({ nominalCodes }: NominalCodesSettingsProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [form, setForm] = useState<FormState>(emptyForm())
  const [deleteTarget, setDeleteTarget] = useState<NominalCode | null>(null)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  function openCreate() {
    setForm(emptyForm())
    setMessage(null)
    setDialogOpen(true)
  }

  function openEdit(c: NominalCode) {
    setForm({ id: c.id, code: c.code, name: c.name, active: c.active })
    setMessage(null)
    setDialogOpen(true)
  }

  function handleSave() {
    if (!form.code.trim()) {
      setMessage({ type: 'error', text: 'A code is required.' })
      return
    }
    if (!form.name.trim()) {
      setMessage({ type: 'error', text: 'A name is required.' })
      return
    }
    const payload = { code: form.code, name: form.name, active: form.active }
    startTransition(async () => {
      const res = form.id
        ? await updateNominalCode(form.id, payload)
        : await createNominalCode(payload)
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
      const res = await deleteNominalCode(target.id)
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
          <CardTitle>Nominal codes</CardTitle>
          <CardDescription>
            Your accounting (Sage) nominal codes. Map them to departments, service types, charges
            and products so invoice lines get the right code automatically. These are internal only
            and never shown on client invoices.
          </CardDescription>
        </div>
        <Button onClick={openCreate} className="gap-2">
          <Plus className="h-4 w-4" />
          Add code
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

        {nominalCodes.length === 0 ? (
          <p className="rounded-md border py-8 text-center text-sm text-muted-foreground">
            No nominal codes yet. Add the codes from your accounts package to get started.
          </p>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-32">Code</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {nominalCodes.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-mono font-medium">{c.code}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span>{c.name}</span>
                        {!c.active && <Badge variant="secondary">Inactive</Badge>}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openEdit(c)}
                          aria-label={`Edit ${c.code}`}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setDeleteTarget(c)}
                          aria-label={`Delete ${c.code}`}
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
            <DialogTitle>{form.id ? 'Edit nominal code' : 'Add nominal code'}</DialogTitle>
            <DialogDescription>
              Enter the code exactly as it appears in your accounts package (e.g. Sage 50).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="grid gap-1.5">
                <Label htmlFor="nc-code">Code</Label>
                <Input
                  id="nc-code"
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value })}
                  placeholder="e.g. 4000"
                  className="font-mono"
                />
              </div>
              <div className="grid gap-1.5 sm:col-span-2">
                <Label htmlFor="nc-name">Name</Label>
                <Input
                  id="nc-name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. Fire alarm maintenance income"
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
              Active (available to map and pick)
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={isPending}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={isPending}>
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {form.id ? 'Save changes' : 'Create code'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleteTarget?.code}?</AlertDialogTitle>
            <AlertDialogDescription>
              Any departments, service types, charges or products mapped to this code will have
              their mapping cleared. Invoices already issued keep their recorded code. This cannot
              be undone.
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
