'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
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
import { MoreHorizontal, Pencil, Trash2, Plus, Loader2, CalendarClock, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { CalendarEntryType } from '@/lib/types/database'

interface EntryTypesManagerProps {
  entryTypes: CalendarEntryType[]
}

// A palette of distinct, accessible colours for entry types.
const COLOR_OPTIONS = [
  '#0ea5e9', // sky
  '#ef4444', // red
  '#f59e0b', // amber
  '#10b981', // emerald
  '#6366f1', // indigo
  '#ec4899', // pink
  '#14b8a6', // teal
  '#f97316', // orange
  '#64748b', // slate
  '#84cc16', // lime
]

interface FormState {
  name: string
  color: string
  is_active: boolean
}

const emptyForm: FormState = { name: '', color: COLOR_OPTIONS[0], is_active: true }

export function EntryTypesManager({ entryTypes }: EntryTypesManagerProps) {
  const router = useRouter()
  const supabase = createClient()

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<CalendarEntryType | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const openAdd = () => {
    setEditing(null)
    setForm(emptyForm)
    setDialogOpen(true)
  }

  const openEdit = (t: CalendarEntryType) => {
    setEditing(t)
    setForm({ name: t.name, color: t.color, is_active: t.is_active })
    setDialogOpen(true)
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name.trim()) return
    setSaving(true)

    if (editing) {
      await supabase
        .from('calendar_entry_types')
        .update({ name: form.name.trim(), color: form.color, is_active: form.is_active })
        .eq('id', editing.id)
    } else {
      const nextOrder =
        entryTypes.reduce((max, t) => Math.max(max, t.sort_order), 0) + 1
      await supabase.from('calendar_entry_types').insert({
        name: form.name.trim(),
        color: form.color,
        is_active: form.is_active,
        sort_order: nextOrder,
      })
    }

    setSaving(false)
    setDialogOpen(false)
    router.refresh()
  }

  const handleDelete = async () => {
    if (!deleteId) return
    setDeleteError(null)
    const { error } = await supabase
      .from('calendar_entry_types')
      .delete()
      .eq('id', deleteId)
    if (error) {
      // restrict FK -> type is in use
      setDeleteError(
        'This type is in use by existing calendar entries and cannot be deleted. Mark it inactive instead.',
      )
      return
    }
    setDeleteId(null)
    router.refresh()
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={openAdd}>
          <Plus className="mr-2 h-4 w-4" />
          Add Entry Type
        </Button>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Colour</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-[70px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {entryTypes.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="h-24 text-center">
                  <div className="flex flex-col items-center justify-center">
                    <CalendarClock className="mb-2 h-8 w-8 text-muted-foreground/50" />
                    <p className="text-muted-foreground">No entry types yet</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              entryTypes.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="font-medium">{t.name}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span
                        className="h-4 w-4 rounded-full"
                        style={{ backgroundColor: t.color }}
                        aria-hidden="true"
                      />
                      <span className="font-mono text-xs text-muted-foreground">
                        {t.color}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={t.is_active ? 'default' : 'secondary'}>
                      {t.is_active ? 'Active' : 'Inactive'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openEdit(t)}>
                          <Pencil className="mr-2 h-4 w-4" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => {
                            setDeleteError(null)
                            setDeleteId(t.id)
                          }}
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

      {/* Add / edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <form onSubmit={handleSave}>
            <DialogHeader>
              <DialogTitle>{editing ? 'Edit Entry Type' : 'Add Entry Type'}</DialogTitle>
              <DialogDescription>
                {editing
                  ? 'Update the name, colour or status of this entry type.'
                  : 'Create a new type of general calendar entry.'}
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="entry-type-name">Name *</Label>
                <Input
                  id="entry-type-name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. Annual Leave"
                  required
                />
              </div>

              <div className="grid gap-2">
                <Label>Colour</Label>
                <div
                  className="flex flex-wrap gap-2"
                  role="radiogroup"
                  aria-label="Entry type colour"
                >
                  {COLOR_OPTIONS.map((c) => {
                    const selected = c.toLowerCase() === form.color.toLowerCase()
                    return (
                      <button
                        key={c}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        aria-label={c}
                        title={c}
                        onClick={() => setForm({ ...form, color: c })}
                        className={cn(
                          'flex h-9 w-9 items-center justify-center rounded-full ring-offset-background transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                          selected ? 'ring-2 ring-ring ring-offset-2' : 'hover:scale-105',
                        )}
                        style={{ backgroundColor: c }}
                      >
                        {selected && (
                          <Check className="h-4 w-4 text-white" aria-hidden="true" />
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="flex items-center justify-between rounded-lg border p-3">
                <div className="space-y-0.5">
                  <Label htmlFor="entry-type-active">Active</Label>
                  <p className="text-xs text-muted-foreground">
                    Inactive types are hidden when creating new entries.
                  </p>
                </div>
                <Switch
                  id="entry-type-active"
                  checked={form.is_active}
                  onCheckedChange={(v) => setForm({ ...form, is_active: v })}
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={saving || !form.name.trim()}>
                {saving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : editing ? (
                  'Save Changes'
                ) : (
                  'Add Type'
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog
        open={!!deleteId}
        onOpenChange={(o) => {
          if (!o) {
            setDeleteId(null)
            setDeleteError(null)
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Entry Type</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteError ??
                'Are you sure you want to delete this entry type? This cannot be undone.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            {!deleteError && (
              <AlertDialogAction
                onClick={(e) => {
                  e.preventDefault()
                  handleDelete()
                }}
                className="bg-destructive text-destructive-foreground"
              >
                Delete
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
