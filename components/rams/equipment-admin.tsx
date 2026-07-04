'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Check, Pencil, Plus, Trash2, Wrench } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  saveEquipment,
  deleteEquipment,
  updateSystemEquipment,
} from '@/lib/rams/equipment-actions'
import type { RamsEquipmentItem, RamsMasterTemplate } from '@/lib/rams/types'

interface EquipmentAdminProps {
  equipment: RamsEquipmentItem[]
  systemTemplates: RamsMasterTemplate[]
}

export function EquipmentAdmin({ equipment, systemTemplates }: EquipmentAdminProps) {
  return (
    <Tabs defaultValue="library" className="space-y-4">
      <TabsList>
        <TabsTrigger value="library">Equipment Library</TabsTrigger>
        <TabsTrigger value="systems">System Defaults</TabsTrigger>
      </TabsList>
      <TabsContent value="library">
        <EquipmentLibrary equipment={equipment} />
      </TabsContent>
      <TabsContent value="systems">
        <SystemDefaults equipment={equipment} systemTemplates={systemTemplates} />
      </TabsContent>
    </Tabs>
  )
}

// ---------------------------------------------------------------------------
// Equipment library management
// ---------------------------------------------------------------------------

function EquipmentLibrary({ equipment }: { equipment: RamsEquipmentItem[] }) {
  const router = useRouter()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<RamsEquipmentItem | null>(null)
  const [name, setName] = useState('')
  const [category, setCategory] = useState('')
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<RamsEquipmentItem | null>(null)

  const grouped = useMemo(() => {
    const groups = new Map<string, RamsEquipmentItem[]>()
    for (const item of equipment) {
      const key = item.category || 'General'
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key)!.push(item)
    }
    return Array.from(groups.entries()).sort((a, b) => a[0].localeCompare(b[0]))
  }, [equipment])

  function openNew() {
    setEditing(null)
    setName('')
    setCategory('')
    setDialogOpen(true)
  }

  function openEdit(item: RamsEquipmentItem) {
    setEditing(item)
    setName(item.name)
    setCategory(item.category)
    setDialogOpen(true)
  }

  async function handleSave() {
    setSaving(true)
    const result = await saveEquipment({
      id: editing?.id,
      name,
      category,
      is_active: editing?.is_active ?? true,
    })
    setSaving(false)
    if (!result.success) {
      toast.error(result.error)
      return
    }
    toast.success(editing ? 'Equipment updated' : 'Equipment added')
    setDialogOpen(false)
    router.refresh()
  }

  async function handleDelete() {
    if (!deleteTarget) return
    const result = await deleteEquipment(deleteTarget.id)
    if (!result.success) {
      toast.error(result.error)
      return
    }
    toast.success('Equipment removed')
    setDeleteTarget(null)
    router.refresh()
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <div>
          <CardTitle>Equipment Library</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            The central list engineers can pick from when building a RAMS.
          </p>
        </div>
        <Button type="button" onClick={openNew}>
          <Plus className="mr-2 h-4 w-4" />
          Add equipment
        </Button>
      </CardHeader>
      <CardContent className="space-y-6">
        {equipment.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No equipment yet. Add your first item to get started.
          </p>
        )}
        {grouped.map(([cat, items]) => (
          <div key={cat} className="space-y-2">
            <h3 className="text-xs font-medium uppercase text-muted-foreground">
              {cat}
            </h3>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead className="w-24">Status</TableHead>
                  <TableHead className="w-24 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">{item.name}</TableCell>
                    <TableCell>
                      {item.is_active ? (
                        <Badge variant="secondary">Active</Badge>
                      ) : (
                        <Badge variant="outline">Hidden</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => openEdit(item)}
                        aria-label={`Edit ${item.name}`}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => setDeleteTarget(item)}
                        aria-label={`Delete ${item.name}`}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ))}
      </CardContent>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit equipment' : 'Add equipment'}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="equip-name">Name *</Label>
              <Input
                id="equip-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Multimeter"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="equip-category">Category</Label>
              <Input
                id="equip-category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="e.g. Test equipment (defaults to General)"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove equipment?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes &ldquo;{deleteTarget?.name}&rdquo; from the library. RAMS
              that already list it are not affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Remove</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// System-type default equipment mapping
// ---------------------------------------------------------------------------

function SystemDefaults({
  equipment,
  systemTemplates,
}: {
  equipment: RamsEquipmentItem[]
  systemTemplates: RamsMasterTemplate[]
}) {
  const router = useRouter()
  const [selectedId, setSelectedId] = useState(systemTemplates[0]?.id ?? '')
  const selected = systemTemplates.find((t) => t.id === selectedId) ?? null

  const [list, setList] = useState<string[]>(selected?.default_equipment ?? [])
  const [dirtyId, setDirtyId] = useState<string | null>(null)
  const [customInput, setCustomInput] = useState('')
  const [saving, setSaving] = useState(false)

  // Reset the working list when the selected system changes.
  function selectSystem(id: string) {
    setSelectedId(id)
    const sys = systemTemplates.find((t) => t.id === id)
    setList(sys?.default_equipment ?? [])
    setDirtyId(null)
  }

  function toggle(item: string) {
    const v = item.trim()
    if (!v) return
    setList((prev) =>
      prev.includes(v) ? prev.filter((e) => e !== v) : [...prev, v],
    )
    setDirtyId(selectedId)
  }

  function addCustom() {
    const v = customInput.trim()
    if (!v) return
    if (!list.includes(v)) {
      setList((prev) => [...prev, v])
      setDirtyId(selectedId)
    }
    setCustomInput('')
  }

  async function handleSave() {
    if (!selectedId) return
    setSaving(true)
    const result = await updateSystemEquipment(selectedId, list)
    setSaving(false)
    if (!result.success) {
      toast.error(result.error)
      return
    }
    toast.success('System defaults saved')
    setDirtyId(null)
    router.refresh()
  }

  if (systemTemplates.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          No system types are configured yet.
        </CardContent>
      </Card>
    )
  }

  const dirty = dirtyId === selectedId

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Wrench className="h-4 w-4" />
          System default equipment
        </CardTitle>
        <p className="mt-1 text-sm text-muted-foreground">
          Equipment auto-added to a RAMS when this system type is selected.
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-2 sm:max-w-xs">
          <Label>System type</Label>
          <Select value={selectedId} onValueChange={selectSystem}>
            <SelectTrigger>
              <SelectValue placeholder="Select a system type" />
            </SelectTrigger>
            <SelectContent>
              {systemTemplates.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label className="text-xs uppercase text-muted-foreground">
            Add from library
          </Label>
          <div className="flex flex-wrap gap-2">
            {equipment.length === 0 && (
              <p className="text-sm text-muted-foreground">
                The equipment library is empty.
              </p>
            )}
            {equipment.map((eq) => {
              const on = list.includes(eq.name)
              return (
                <Button
                  key={eq.id}
                  type="button"
                  variant={on ? 'default' : 'outline'}
                  size="sm"
                  aria-pressed={on}
                  onClick={() => toggle(eq.name)}
                >
                  {on ? (
                    <Check className="mr-1 h-3 w-3" />
                  ) : (
                    <Plus className="mr-1 h-3 w-3" />
                  )}
                  {eq.name}
                </Button>
              )
            })}
          </div>
        </div>

        <div className="space-y-2">
          <Label className="text-xs uppercase text-muted-foreground">
            Add custom
          </Label>
          <div className="flex gap-2 sm:max-w-md">
            <Input
              value={customInput}
              onChange={(e) => setCustomInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                  e.preventDefault()
                  addCustom()
                }
              }}
              placeholder="Add equipment and press Enter"
            />
            <Button type="button" onClick={addCustom}>
              Add
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          <Label className="text-xs uppercase text-muted-foreground">
            Default equipment ({list.length})
          </Label>
          <div className="flex flex-wrap gap-2">
            {list.map((item) => (
              <Badge
                key={item}
                variant="secondary"
                className="cursor-pointer"
                onClick={() => toggle(item)}
              >
                {item}
                <Trash2 className="ml-1 h-3 w-3" />
              </Badge>
            ))}
            {list.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No default equipment for this system yet.
              </p>
            )}
          </div>
        </div>

        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={!dirty || saving}>
            {saving ? 'Saving…' : 'Save defaults'}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
