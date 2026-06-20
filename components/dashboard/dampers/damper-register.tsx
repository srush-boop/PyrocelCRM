'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Plus, Wind, Loader2, QrCode, Printer, MoreHorizontal, Pencil, Trash2, ExternalLink, ChevronDown } from 'lucide-react'
import { ImportDampersDialog } from './import-dampers-dialog'
import { ScanQrButton } from './scan-qr-button'
import { SizeCombobox } from './size-combobox'
import { DAMPER_TYPE_LABELS, generateUrn } from '@/lib/dampers'
import type { Damper, DamperType, DamperResult } from '@/lib/types/database'

interface DamperRegisterProps {
  siteId: string
  siteName: string
  dampers: Damper[]
}

const RESULT_VARIANT: Record<DamperResult, 'default' | 'destructive' | 'secondary' | 'outline'> = {
  pass: 'default',
  fail: 'destructive',
  remedial: 'secondary',
  na: 'outline',
}

const emptyForm = {
  reference: '',
  floor: '',
  location: '',
  damper_type: 'fire' as DamperType,
  size_mm: '',
  notes: '',
}

export function DamperRegister({ siteId, siteName, dampers }: DamperRegisterProps) {
  const [open, setOpen] = useState(true)
  const [search, setSearch] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Damper | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const router = useRouter()
  const supabase = createClient()

  const filtered = dampers.filter((d) => {
    const q = search.toLowerCase()
    return (
      d.urn.toLowerCase().includes(q) ||
      (d.reference || '').toLowerCase().includes(q) ||
      (d.location || '').toLowerCase().includes(q) ||
      (d.floor || '').toLowerCase().includes(q)
    )
  })

  const openAdd = () => {
    setEditing(null)
    setForm(emptyForm)
    setDialogOpen(true)
  }

  const openEdit = (damper: Damper) => {
    setEditing(damper)
    setForm({
      reference: damper.reference || '',
      floor: damper.floor || '',
      location: damper.location || '',
      damper_type: damper.damper_type,
      size_mm: damper.size_mm || '',
      notes: damper.notes || '',
    })
    setDialogOpen(true)
  }

  const handleSave = async () => {
    setSaving(true)
    if (editing) {
      await supabase
        .from('dampers')
        .update({
          reference: form.reference || null,
          floor: form.floor || null,
          location: form.location || null,
          damper_type: form.damper_type,
          size_mm: form.size_mm || null,
          notes: form.notes || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', editing.id)
    } else {
      await supabase.from('dampers').insert({
        site_id: siteId,
        urn: generateUrn(),
        reference: form.reference || null,
        floor: form.floor || null,
        location: form.location || null,
        damper_type: form.damper_type,
        size_mm: form.size_mm || null,
        notes: form.notes || null,
      })
    }
    setSaving(false)
    setDialogOpen(false)
    router.refresh()
  }

  const handleDelete = async () => {
    if (!deleteId) return
    await supabase.from('dampers').delete().eq('id', deleteId)
    setDeleteId(null)
    router.refresh()
  }

  return (
    <Collapsible asChild open={open} onOpenChange={setOpen}>
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-2">
            <CollapsibleTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0"
                aria-label={open ? 'Collapse damper register' : 'Expand damper register'}
              >
                <ChevronDown
                  className={`h-4 w-4 transition-transform ${open ? '' : '-rotate-90'}`}
                />
              </Button>
            </CollapsibleTrigger>
            <div>
              <CardTitle className="flex items-center gap-2">
                <Wind className="h-5 w-5" />
                Damper Register
              </CardTitle>
              <CardDescription>
                {dampers.length} damper{dampers.length === 1 ? '' : 's'} registered for this site
              </CardDescription>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <ScanQrButton />
            <ImportDampersDialog siteId={siteId} />
            {dampers.length > 0 && (
              <Button variant="outline" size="sm" asChild>
                <Link href={`/dashboard/dampers/labels?site=${siteId}`} target="_blank">
                  <Printer className="mr-2 h-4 w-4" />
                  Print all labels
                </Link>
              </Button>
            )}
            <Button size="sm" onClick={openAdd}>
              <Plus className="mr-2 h-4 w-4" />
              Add Damper
            </Button>
          </div>
        </div>
      </CardHeader>
      <CollapsibleContent>
      <CardContent className="space-y-4">
        {dampers.length > 0 && (
          <Input
            placeholder="Search by URN, reference, location, floor…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-sm"
          />
        )}

        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>URN</TableHead>
                <TableHead>Reference</TableHead>
                <TableHead className="hidden sm:table-cell">Floor</TableHead>
                <TableHead>Location</TableHead>
                <TableHead className="hidden md:table-cell">Type</TableHead>
                <TableHead>Latest</TableHead>
                <TableHead className="w-[70px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                    {dampers.length === 0
                      ? 'No dampers yet. Add one or import from Excel to get started.'
                      : 'No dampers match your search.'}
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
                    <TableCell>{damper.reference || '-'}</TableCell>
                    <TableCell className="hidden sm:table-cell">{damper.floor || '-'}</TableCell>
                    <TableCell className="max-w-[180px] truncate">{damper.location || '-'}</TableCell>
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
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem asChild>
                            <Link href={`/dashboard/dampers/${damper.urn}`}>
                              <ExternalLink className="mr-2 h-4 w-4" />
                              View history
                            </Link>
                          </DropdownMenuItem>
                          <DropdownMenuItem asChild>
                            <Link href={`/dashboard/dampers/labels?ids=${damper.id}`} target="_blank">
                              <QrCode className="mr-2 h-4 w-4" />
                              Print QR
                            </Link>
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => openEdit(damper)}>
                            <Pencil className="mr-2 h-4 w-4" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => setDeleteId(damper.id)}
                            className="text-destructive"
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
      </CollapsibleContent>

      {/* Add / Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Damper' : 'Add Damper'}</DialogTitle>
            <DialogDescription>
              {editing
                ? `Updating ${editing.urn}`
                : 'A unique URN will be generated automatically for the QR label.'}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="reference">Reference</Label>
              <Input
                id="reference"
                value={form.reference}
                onChange={(e) => setForm({ ...form, reference: e.target.value })}
                placeholder="e.g. FD-001"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="type">Damper Type</Label>
              <Select
                value={form.damper_type}
                onValueChange={(v) => setForm({ ...form, damper_type: v as DamperType })}
              >
                <SelectTrigger id="type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="fire">Fire Damper</SelectItem>
                  <SelectItem value="smoke">Smoke Damper</SelectItem>
                  <SelectItem value="fire_smoke">Fire/Smoke Damper</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="floor">Floor / Level</Label>
              <Input
                id="floor"
                value={form.floor}
                onChange={(e) => setForm({ ...form, floor: e.target.value })}
                placeholder="e.g. Ground"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="size">Size / Shape</Label>
              <SizeCombobox
                id="size"
                value={form.size_mm}
                onChange={(v) => setForm({ ...form, size_mm: v })}
                placeholder="e.g. 300x300 Rectangular"
              />
            </div>
            <div className="grid gap-2 sm:col-span-2">
              <Label htmlFor="location">Location</Label>
              <Input
                id="location"
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
                placeholder="e.g. Plant Room AHU-1"
              />
            </div>
            <div className="grid gap-2 sm:col-span-2">
              <Label htmlFor="notes">Notes</Label>
              <Input
                id="notes"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Access notes, etc."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editing ? 'Save changes' : 'Add damper'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this damper?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the damper and all its inspection history. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
    </Collapsible>
  )
}
