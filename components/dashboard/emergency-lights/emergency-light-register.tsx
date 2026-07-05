'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { PrintButton } from '@/components/ui/print-button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Plus, Lightbulb, Loader2, MoreHorizontal, Pencil, Trash2, Camera, X, MapPin, ChevronDown } from 'lucide-react'
import {
  EMERGENCY_LIGHT_RESULT_VARIANT,
  FITTING_TYPES,
  generateEmergencyLightUrn,
} from '@/lib/emergency-lights'
import type { EmergencyLight } from '@/lib/types/database'

interface EmergencyLightRegisterProps {
  siteId: string
  lights: EmergencyLight[]
}

const emptyForm = {
  map_reference: '',
  floor: '',
  location: '',
  fitting_type: '',
  notes: '',
  photos: [] as string[],
}

export function EmergencyLightRegister({ siteId, lights }: EmergencyLightRegisterProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<EmergencyLight | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const router = useRouter()
  const supabase = createClient()

  const filtered = lights.filter((l) => {
    const q = search.toLowerCase()
    return (
      l.urn?.toLowerCase().includes(q) ||
      (l.map_reference || '').toLowerCase().includes(q) ||
      (l.location || '').toLowerCase().includes(q) ||
      (l.floor || '').toLowerCase().includes(q)
    )
  })

  const openAdd = () => {
    setEditing(null)
    setForm(emptyForm)
    setDialogOpen(true)
  }

  const openEdit = (light: EmergencyLight) => {
    setEditing(light)
    setForm({
      map_reference: light.map_reference || '',
      floor: light.floor || '',
      location: light.location || '',
      fitting_type: light.fitting_type || '',
      notes: light.notes || '',
      photos: light.photos || [],
    })
    setDialogOpen(true)
  }

  const handlePhotos = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    setUploading(true)
    const urls: string[] = []
    for (const file of Array.from(files)) {
      const safeName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, '_')
      const path = `${siteId}/${Date.now()}-${safeName}`
      const { error } = await supabase.storage
        .from('emergency-light-photos')
        .upload(path, file, { upsert: false })
      if (error) {
        console.log('[v0] Emergency light photo upload error:', error.message)
        continue
      }
      const { data } = supabase.storage.from('emergency-light-photos').getPublicUrl(path)
      urls.push(data.publicUrl)
    }
    setUploading(false)
    setForm((prev) => ({ ...prev, photos: [...prev.photos, ...urls] }))
  }

  const removePhoto = (url: string) => {
    setForm((prev) => ({ ...prev, photos: prev.photos.filter((p) => p !== url) }))
  }

  const handleSave = async () => {
    setSaving(true)
    if (editing) {
      await supabase
        .from('emergency_lights')
        .update({
          map_reference: form.map_reference || null,
          floor: form.floor || null,
          location: form.location || null,
          fitting_type: form.fitting_type || null,
          notes: form.notes || null,
          photos: form.photos,
          updated_at: new Date().toISOString(),
        })
        .eq('id', editing.id)
    } else {
      await supabase.from('emergency_lights').insert({
        site_id: siteId,
        urn: generateEmergencyLightUrn(),
        map_reference: form.map_reference || null,
        floor: form.floor || null,
        location: form.location || null,
        fitting_type: form.fitting_type || null,
        notes: form.notes || null,
        photos: form.photos,
      })
    }
    setSaving(false)
    setDialogOpen(false)
    router.refresh()
  }

  const handleDelete = async () => {
    if (!deleteId) return
    await supabase.from('emergency_lights').delete().eq('id', deleteId)
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
                aria-label={open ? 'Collapse emergency lighting register' : 'Expand emergency lighting register'}
              >
                <ChevronDown
                  className={`h-4 w-4 transition-transform ${open ? '' : '-rotate-90'}`}
                />
              </Button>
            </CollapsibleTrigger>
            <div>
              <CardTitle className="flex items-center gap-2">
                <Lightbulb className="h-5 w-5" />
                Emergency Lighting Register
              </CardTitle>
              <CardDescription>
                {lights.length} fitting{lights.length === 1 ? '' : 's'} registered for this site
              </CardDescription>
            </div>
          </div>
          <Button size="sm" onClick={openAdd}>
            <Plus className="mr-2 h-4 w-4" />
            Add Fitting
          </Button>
        </div>
      </CardHeader>
      <CollapsibleContent>
      <CardContent className="space-y-4">
        {lights.length > 0 && (
          <div className="flex items-center gap-3">
            <Input
              placeholder="Search by URN, map ref, location, floor…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-sm"
            />
            <PrintButton targetId="emergency-lights-grid" title="Emergency Light Register" className="ml-auto" />
          </div>
        )}

        <div className="rounded-md border">
          <Table id="emergency-lights-grid">
            <TableHeader>
              <TableRow>
                <TableHead>URN</TableHead>
                <TableHead>Map Ref</TableHead>
                <TableHead className="hidden sm:table-cell">Floor</TableHead>
                <TableHead>Location</TableHead>
                <TableHead className="hidden md:table-cell">Fitting Type</TableHead>
                <TableHead>Latest</TableHead>
                <TableHead className="w-[70px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                    {lights.length === 0
                      ? 'No emergency light fittings yet. Add one to get started.'
                      : 'No fittings match your search.'}
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((light) => (
                  <TableRow key={light.id}>
                    <TableCell className="font-mono font-medium">{light.urn}</TableCell>
                    <TableCell>{light.map_reference || '-'}</TableCell>
                    <TableCell className="hidden sm:table-cell">{light.floor || '-'}</TableCell>
                    <TableCell className="max-w-[180px] truncate">{light.location || '-'}</TableCell>
                    <TableCell className="hidden md:table-cell">{light.fitting_type || '-'}</TableCell>
                    <TableCell>
                      {light.latest_result ? (
                        <Badge
                          variant={EMERGENCY_LIGHT_RESULT_VARIANT[light.latest_result]}
                          className="capitalize"
                        >
                          {light.latest_result}
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
                          <DropdownMenuItem onClick={() => openEdit(light)}>
                            <Pencil className="mr-2 h-4 w-4" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => setDeleteId(light.id)}
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
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Fitting' : 'Add Fitting'}</DialogTitle>
            <DialogDescription>
              {editing
                ? `Updating ${editing.urn}`
                : 'A unique URN will be generated automatically for this fitting.'}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="map_reference">Map Reference No.</Label>
              <Input
                id="map_reference"
                value={form.map_reference}
                onChange={(e) => setForm({ ...form, map_reference: e.target.value })}
                placeholder="e.g. EL-12 / Zone 3"
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
            <div className="grid gap-2 sm:col-span-2">
              <Label htmlFor="location">Location / Position</Label>
              <Input
                id="location"
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
                placeholder="e.g. Above east stairwell exit"
              />
            </div>
            <div className="grid gap-2 sm:col-span-2">
              <Label htmlFor="fitting_type">Fitting Type</Label>
              <Input
                id="fitting_type"
                list="el-fitting-types"
                value={form.fitting_type}
                onChange={(e) => setForm({ ...form, fitting_type: e.target.value })}
                placeholder="Select or type a fitting type"
              />
              <datalist id="el-fitting-types">
                {FITTING_TYPES.map((t) => (
                  <option key={t} value={t} />
                ))}
              </datalist>
            </div>
            <div className="grid gap-2 sm:col-span-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Access notes, etc."
                rows={2}
              />
            </div>

            {/* Asset photos */}
            <div className="grid gap-2 sm:col-span-2">
              <Label className="flex items-center gap-1.5">
                <MapPin className="h-4 w-4" />
                Asset Photos
              </Label>
              <p className="text-xs text-muted-foreground">
                Photos of the fitting and where it is located.
              </p>
              <div className="flex flex-wrap gap-2">
                {form.photos.map((url) => (
                  <div key={url} className="relative h-20 w-20 overflow-hidden rounded-md border">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={url || '/placeholder.svg'}
                      alt="Emergency light fitting"
                      className="h-full w-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => removePhoto(url)}
                      className="absolute right-0.5 top-0.5 rounded-full bg-background/80 p-0.5"
                      aria-label="Remove photo"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
                <label className="flex h-20 w-20 cursor-pointer flex-col items-center justify-center gap-1 rounded-md border border-dashed text-muted-foreground hover:bg-muted">
                  {uploading ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <>
                      <Camera className="h-5 w-5" />
                      <span className="text-[10px]">Add</span>
                    </>
                  )}
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    disabled={uploading}
                    onChange={(e) => handlePhotos(e.target.files)}
                  />
                </label>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving || uploading}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editing ? 'Save changes' : 'Add fitting'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this fitting?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the fitting and all its test history. This cannot be undone.
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
