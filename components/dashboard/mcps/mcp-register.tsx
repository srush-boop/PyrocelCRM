'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
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
import { Plus, BellRing, Loader2, MoreHorizontal, Pencil, Trash2, Camera, X, MapPin, ImageIcon, ChevronDown } from 'lucide-react'
import { MCP_RESULT_VARIANT, TEST_KEY_TYPES, generateMcpUrn } from '@/lib/mcps'
import type { Mcp } from '@/lib/types/database'

interface McpRegisterProps {
  siteId: string
  mcps: Mcp[]
}

const emptyForm = {
  reference: '',
  map_reference: '',
  floor: '',
  location: '',
  test_key_type: '',
  notes: '',
  photos: [] as string[],
  asset_image_url: '' as string,
}

export function McpRegister({ siteId, mcps }: McpRegisterProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Mcp | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadingAsset, setUploadingAsset] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const router = useRouter()
  const supabase = createClient()

  const filtered = mcps.filter((m) => {
    const q = search.toLowerCase()
    return (
      m.urn?.toLowerCase().includes(q) ||
      (m.map_reference || '').toLowerCase().includes(q) ||
      (m.location || '').toLowerCase().includes(q) ||
      (m.floor || '').toLowerCase().includes(q)
    )
  })

  const openAdd = () => {
    setEditing(null)
    setForm(emptyForm)
    setDialogOpen(true)
  }

  const openEdit = (mcp: Mcp) => {
    setEditing(mcp)
    setForm({
      reference: mcp.urn || '',
      map_reference: mcp.map_reference || '',
      floor: mcp.floor || '',
      location: mcp.location || '',
      test_key_type: mcp.test_key_type || '',
      notes: mcp.notes || '',
      photos: mcp.photos || [],
      asset_image_url: mcp.asset_image_url || '',
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
      const { error } = await supabase.storage.from('mcp-photos').upload(path, file, { upsert: false })
      if (error) {
        console.log('[v0] MCP photo upload error:', error.message)
        continue
      }
      const { data } = supabase.storage.from('mcp-photos').getPublicUrl(path)
      urls.push(data.publicUrl)
    }
    setUploading(false)
    setForm((prev) => ({ ...prev, photos: [...prev.photos, ...urls] }))
  }

  const removePhoto = (url: string) => {
    setForm((prev) => ({ ...prev, photos: prev.photos.filter((p) => p !== url) }))
  }

  const handleAssetImage = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    setUploadingAsset(true)
    const file = files[0]
    const safeName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, '_')
    const path = `${siteId}/asset/${Date.now()}-${safeName}`
    const { error } = await supabase.storage.from('mcp-photos').upload(path, file, { upsert: false })
    if (error) {
      console.log('[v0] MCP asset image upload error:', error.message)
      setUploadingAsset(false)
      return
    }
    const { data } = supabase.storage.from('mcp-photos').getPublicUrl(path)
    setUploadingAsset(false)
    setForm((prev) => ({ ...prev, asset_image_url: data.publicUrl }))
  }

  const handleSave = async () => {
    setSaving(true)
    if (editing) {
      await supabase
        .from('mcps')
        .update({
          map_reference: form.map_reference || null,
          floor: form.floor || null,
          location: form.location || null,
          test_key_type: form.test_key_type || null,
          notes: form.notes || null,
          photos: form.photos,
          asset_image_url: form.asset_image_url || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', editing.id)
    } else {
      await supabase.from('mcps').insert({
        site_id: siteId,
        urn: generateMcpUrn(),
        map_reference: form.map_reference || null,
        floor: form.floor || null,
        location: form.location || null,
        test_key_type: form.test_key_type || null,
        notes: form.notes || null,
        photos: form.photos,
        asset_image_url: form.asset_image_url || null,
      })
    }
    setSaving(false)
    setDialogOpen(false)
    router.refresh()
  }

  const handleDelete = async () => {
    if (!deleteId) return
    await supabase.from('mcps').delete().eq('id', deleteId)
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
                aria-label={open ? 'Collapse call point register' : 'Expand call point register'}
              >
                <ChevronDown
                  className={`h-4 w-4 transition-transform ${open ? '' : '-rotate-90'}`}
                />
              </Button>
            </CollapsibleTrigger>
            <div>
              <CardTitle className="flex items-center gap-2">
                <BellRing className="h-5 w-5" />
                Manual Call Point Register
              </CardTitle>
              <CardDescription>
                {mcps.length} call point{mcps.length === 1 ? '' : 's'} registered for this site
              </CardDescription>
            </div>
          </div>
          <Button size="sm" onClick={openAdd}>
            <Plus className="mr-2 h-4 w-4" />
            Add MCP
          </Button>
        </div>
      </CardHeader>
      <CollapsibleContent>
      <CardContent className="space-y-4">
        {mcps.length > 0 && (
          <Input
            placeholder="Search by URN, map ref, location, floor…"
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
                <TableHead>Map Ref</TableHead>
                <TableHead className="hidden sm:table-cell">Floor</TableHead>
                <TableHead>Location</TableHead>
                <TableHead className="hidden md:table-cell">Key Type</TableHead>
                <TableHead>Latest</TableHead>
                <TableHead className="w-[70px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                    {mcps.length === 0
                      ? 'No manual call points yet. Add one to get started.'
                      : 'No call points match your search.'}
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((mcp) => (
                  <TableRow key={mcp.id}>
                    <TableCell className="font-mono font-medium">{mcp.urn}</TableCell>
                    <TableCell>{mcp.map_reference || '-'}</TableCell>
                    <TableCell className="hidden sm:table-cell">{mcp.floor || '-'}</TableCell>
                    <TableCell className="max-w-[180px] truncate">{mcp.location || '-'}</TableCell>
                    <TableCell className="hidden md:table-cell">{mcp.test_key_type || '-'}</TableCell>
                    <TableCell>
                      {mcp.latest_result ? (
                        <Badge variant={MCP_RESULT_VARIANT[mcp.latest_result]} className="capitalize">
                          {mcp.latest_result}
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
                          <DropdownMenuItem onClick={() => openEdit(mcp)}>
                            <Pencil className="mr-2 h-4 w-4" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => setDeleteId(mcp.id)}
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
            <DialogTitle>{editing ? 'Edit Call Point' : 'Add Call Point'}</DialogTitle>
            <DialogDescription>
              {editing
                ? `Updating ${editing.urn}`
                : 'A unique URN will be generated automatically for this call point.'}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="map_reference">Map Reference No.</Label>
              <Input
                id="map_reference"
                value={form.map_reference}
                onChange={(e) => setForm({ ...form, map_reference: e.target.value })}
                placeholder="e.g. MCP-12 / Zone 3"
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
                placeholder="e.g. By main entrance, east stairwell"
              />
            </div>
            <div className="grid gap-2 sm:col-span-2">
              <Label htmlFor="test_key_type">Test Key Type</Label>
              <Input
                id="test_key_type"
                list="mcp-key-types"
                value={form.test_key_type}
                onChange={(e) => setForm({ ...form, test_key_type: e.target.value })}
                placeholder="Select or type a key type"
              />
              <datalist id="mcp-key-types">
                {TEST_KEY_TYPES.map((t) => (
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

            {/* Asset image — the call point device itself */}
            <div className="grid gap-2 sm:col-span-2">
              <Label className="flex items-center gap-1.5">
                <ImageIcon className="h-4 w-4" />
                Call Point Image
              </Label>
              <p className="text-xs text-muted-foreground">
                A photo of the call point device itself. Shown to engineers during inspection to
                help identify the correct unit.
              </p>
              <div className="flex flex-wrap gap-2">
                {form.asset_image_url ? (
                  <div className="relative h-28 w-28 overflow-hidden rounded-md border">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={form.asset_image_url || '/placeholder.svg'}
                      alt="Manual call point asset"
                      className="h-full w-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => setForm((prev) => ({ ...prev, asset_image_url: '' }))}
                      className="absolute right-0.5 top-0.5 rounded-full bg-background/80 p-0.5"
                      aria-label="Remove asset image"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ) : (
                  <label className="flex h-28 w-28 cursor-pointer flex-col items-center justify-center gap-1 rounded-md border border-dashed text-muted-foreground hover:bg-muted">
                    {uploadingAsset ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <>
                        <Camera className="h-5 w-5" />
                        <span className="text-[10px]">Add image</span>
                      </>
                    )}
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      className="hidden"
                      disabled={uploadingAsset}
                      onChange={(e) => handleAssetImage(e.target.files)}
                    />
                  </label>
                )}
              </div>
            </div>

            {/* Position photos */}
            <div className="grid gap-2 sm:col-span-2">
              <Label className="flex items-center gap-1.5">
                <MapPin className="h-4 w-4" />
                Position Photos
              </Label>
              <p className="text-xs text-muted-foreground">
                Photos showing where this call point is located.
              </p>
              <div className="flex flex-wrap gap-2">
                {form.photos.map((url) => (
                  <div key={url} className="relative h-20 w-20 overflow-hidden rounded-md border">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url || '/placeholder.svg'} alt="Call point position" className="h-full w-full object-cover" />
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
                    capture="environment"
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
            <Button onClick={handleSave} disabled={saving || uploading || uploadingAsset}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editing ? 'Save changes' : 'Add call point'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this call point?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the call point and all its test history. This cannot be undone.
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
