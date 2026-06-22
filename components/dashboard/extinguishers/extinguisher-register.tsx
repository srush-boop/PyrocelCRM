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
import {
  Plus,
  FireExtinguisher,
  Loader2,
  QrCode,
  Printer,
  MoreHorizontal,
  Pencil,
  Trash2,
  ExternalLink,
  ChevronDown,
} from 'lucide-react'
import { ImportExtinguishersDialog } from './import-extinguishers-dialog'
import { ScanQrButton } from './scan-qr-button'
import { EXTINGUISHER_TYPE_LABELS, generateUrn } from '@/lib/extinguishers'
import type { Extinguisher, ExtinguisherType, ExtinguisherResult } from '@/lib/types/database'

interface ExtinguisherRegisterProps {
  siteId: string
  siteName: string
  extinguishers: Extinguisher[]
}

const RESULT_VARIANT: Record<ExtinguisherResult, 'default' | 'destructive' | 'secondary' | 'outline'> = {
  pass: 'default',
  fail: 'destructive',
  remedial: 'secondary',
  na: 'outline',
}

const emptyForm = {
  reference: '',
  floor: '',
  location: '',
  extinguisher_type: 'water' as ExtinguisherType,
  capacity: '',
  serial_number: '',
  manufacture_date: '',
  commissioned_date: '',
  notes: '',
}

export function ExtinguisherRegister({ siteId, siteName, extinguishers }: ExtinguisherRegisterProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Extinguisher | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const router = useRouter()
  const supabase = createClient()

  const filtered = extinguishers.filter((e) => {
    const q = search.toLowerCase()
    return (
      e.urn.toLowerCase().includes(q) ||
      (e.reference || '').toLowerCase().includes(q) ||
      (e.location || '').toLowerCase().includes(q) ||
      (e.serial_number || '').toLowerCase().includes(q) ||
      (e.floor || '').toLowerCase().includes(q)
    )
  })

  const openAdd = () => {
    setEditing(null)
    setForm(emptyForm)
    setDialogOpen(true)
  }

  const openEdit = (extinguisher: Extinguisher) => {
    setEditing(extinguisher)
    setForm({
      reference: extinguisher.reference || '',
      floor: extinguisher.floor || '',
      location: extinguisher.location || '',
      extinguisher_type: extinguisher.extinguisher_type,
      capacity: extinguisher.capacity || '',
      serial_number: extinguisher.serial_number || '',
      manufacture_date: extinguisher.manufacture_date || '',
      commissioned_date: extinguisher.commissioned_date || '',
      notes: extinguisher.notes || '',
    })
    setDialogOpen(true)
  }

  const handleSave = async () => {
    setSaving(true)
    if (editing) {
      await supabase
        .from('extinguishers')
        .update({
          reference: form.reference || null,
          floor: form.floor || null,
          location: form.location || null,
          extinguisher_type: form.extinguisher_type,
          capacity: form.capacity || null,
          serial_number: form.serial_number || null,
          manufacture_date: form.manufacture_date || null,
          commissioned_date: form.commissioned_date || null,
          notes: form.notes || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', editing.id)
    } else {
      await supabase.from('extinguishers').insert({
        site_id: siteId,
        urn: generateUrn(),
        reference: form.reference || null,
        floor: form.floor || null,
        location: form.location || null,
        extinguisher_type: form.extinguisher_type,
        capacity: form.capacity || null,
        serial_number: form.serial_number || null,
        manufacture_date: form.manufacture_date || null,
        commissioned_date: form.commissioned_date || null,
        notes: form.notes || null,
      })
    }
    setSaving(false)
    setDialogOpen(false)
    router.refresh()
  }

  const handleDelete = async () => {
    if (!deleteId) return
    await supabase.from('extinguishers').delete().eq('id', deleteId)
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
                aria-label={open ? 'Collapse extinguisher register' : 'Expand extinguisher register'}
              >
                <ChevronDown
                  className={`h-4 w-4 transition-transform ${open ? '' : '-rotate-90'}`}
                />
              </Button>
            </CollapsibleTrigger>
            <div>
              <CardTitle className="flex items-center gap-2">
                <FireExtinguisher className="h-5 w-5" />
                Extinguisher Register
              </CardTitle>
              <CardDescription>
                {extinguishers.length} extinguisher{extinguishers.length === 1 ? '' : 's'} registered for this site
              </CardDescription>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <ScanQrButton />
            <ImportExtinguishersDialog siteId={siteId} />
            {extinguishers.length > 0 && (
              <Button variant="outline" size="sm" asChild>
                <Link href={`/dashboard/extinguishers/labels?site=${siteId}`} target="_blank">
                  <Printer className="mr-2 h-4 w-4" />
                  Print all labels
                </Link>
              </Button>
            )}
            <Button size="sm" onClick={openAdd}>
              <Plus className="mr-2 h-4 w-4" />
              Add Extinguisher
            </Button>
          </div>
        </div>
      </CardHeader>
      <CollapsibleContent>
      <CardContent className="space-y-4">
        {extinguishers.length > 0 && (
          <Input
            placeholder="Search by URN, reference, location, serial…"
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
                    {extinguishers.length === 0
                      ? 'No extinguishers yet. Add one or import from Excel to get started.'
                      : 'No extinguishers match your search.'}
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((extinguisher) => (
                  <TableRow key={extinguisher.id}>
                    <TableCell>
                      <Link
                        href={`/dashboard/extinguishers/${extinguisher.urn}`}
                        className="font-mono font-medium text-primary hover:underline"
                      >
                        {extinguisher.urn}
                      </Link>
                    </TableCell>
                    <TableCell>{extinguisher.reference || '-'}</TableCell>
                    <TableCell className="hidden sm:table-cell">{extinguisher.floor || '-'}</TableCell>
                    <TableCell className="max-w-[180px] truncate">{extinguisher.location || '-'}</TableCell>
                    <TableCell className="hidden md:table-cell">
                      {EXTINGUISHER_TYPE_LABELS[extinguisher.extinguisher_type]}
                    </TableCell>
                    <TableCell>
                      {extinguisher.latest_result ? (
                        <Badge
                          variant={RESULT_VARIANT[extinguisher.latest_result]}
                          className="capitalize"
                        >
                          {extinguisher.latest_result}
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">Not serviced</span>
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
                            <Link href={`/dashboard/extinguishers/${extinguisher.urn}`}>
                              <ExternalLink className="mr-2 h-4 w-4" />
                              View history
                            </Link>
                          </DropdownMenuItem>
                          <DropdownMenuItem asChild>
                            <Link
                              href={`/dashboard/extinguishers/labels?ids=${extinguisher.id}`}
                              target="_blank"
                            >
                              <QrCode className="mr-2 h-4 w-4" />
                              Print QR
                            </Link>
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => openEdit(extinguisher)}>
                            <Pencil className="mr-2 h-4 w-4" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => setDeleteId(extinguisher.id)}
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
            <DialogTitle>{editing ? 'Edit Extinguisher' : 'Add Extinguisher'}</DialogTitle>
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
                placeholder="e.g. EXT-001"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="type">Extinguisher Type</Label>
              <Select
                value={form.extinguisher_type}
                onValueChange={(v) => setForm({ ...form, extinguisher_type: v as ExtinguisherType })}
              >
                <SelectTrigger id="type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(EXTINGUISHER_TYPE_LABELS) as ExtinguisherType[]).map((t) => (
                    <SelectItem key={t} value={t}>
                      {EXTINGUISHER_TYPE_LABELS[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="capacity">Capacity</Label>
              <Input
                id="capacity"
                value={form.capacity}
                onChange={(e) => setForm({ ...form, capacity: e.target.value })}
                placeholder="e.g. 6 litre / 2 kg"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="serial">Serial Number</Label>
              <Input
                id="serial"
                value={form.serial_number}
                onChange={(e) => setForm({ ...form, serial_number: e.target.value })}
                placeholder="Manufacturer serial"
              />
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
              <Label htmlFor="location">Location</Label>
              <Input
                id="location"
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
                placeholder="e.g. Reception by main door"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="manufacture_date">Manufacture Date</Label>
              <Input
                id="manufacture_date"
                type="date"
                value={form.manufacture_date}
                onChange={(e) => setForm({ ...form, manufacture_date: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="commissioned_date">Commissioned Date</Label>
              <Input
                id="commissioned_date"
                type="date"
                value={form.commissioned_date}
                onChange={(e) => setForm({ ...form, commissioned_date: e.target.value })}
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
              {editing ? 'Save changes' : 'Add extinguisher'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this extinguisher?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the extinguisher and all its service history. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
    </Collapsible>
  )
}
