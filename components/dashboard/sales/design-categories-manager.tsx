'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  saveDesignCategory,
  deleteDesignCategory,
} from '@/app/(dashboard)/dashboard/sales/quote-config-actions'
import type { QuoteDesignCategory } from '@/lib/types/database'

export function DesignCategoriesManager({ categories }: { categories: QuoteDesignCategory[] }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<QuoteDesignCategory | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [overview, setOverview] = useState('')

  function openNew() {
    setEditing(null)
    setName('')
    setOverview('')
    setOpen(true)
  }

  function openEdit(cat: QuoteDesignCategory) {
    setEditing(cat)
    setName(cat.name)
    setOverview(cat.overview ?? '')
    setOpen(true)
  }

  function handleSave() {
    if (!name.trim()) {
      toast.error('Name is required')
      return
    }
    startTransition(async () => {
      const res = await saveDesignCategory({ id: editing?.id, name: name.trim(), overview })
      if (res.ok) {
        toast.success(editing ? 'Category updated' : 'Category added')
        setOpen(false)
        router.refresh()
      } else {
        toast.error(res.error ?? 'Could not save category')
      }
    })
  }

  function handleDelete() {
    if (!deleteId) return
    startTransition(async () => {
      const res = await deleteDesignCategory(deleteId)
      if (res.ok) {
        toast.success('Category deleted')
        setDeleteId(null)
        router.refresh()
      } else {
        toast.error(res.error ?? 'Could not delete category')
      }
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={openNew}>
          <Plus className="mr-2 h-4 w-4" />
          Add category
        </Button>
      </div>

      {categories.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No design categories yet. Add your first to get started.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {categories.map((cat) => (
            <Card key={cat.id}>
              <CardContent className="flex items-start justify-between gap-4 py-4">
                <div className="min-w-0">
                  <div className="font-medium">{cat.name}</div>
                  {cat.overview && (
                    <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
                      {cat.overview}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button variant="ghost" size="icon" onClick={() => openEdit(cat)}>
                    <Pencil className="h-4 w-4" />
                    <span className="sr-only">Edit</span>
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => setDeleteId(cat.id)}>
                    <Trash2 className="h-4 w-4" />
                    <span className="sr-only">Delete</span>
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit category' : 'Add category'}</DialogTitle>
            <DialogDescription>
              The overview is imported onto a system when this category is selected.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="cat-name">Name *</Label>
              <Input
                id="cat-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Category 1 — Life Safety"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="cat-overview">Overview</Label>
              <Textarea
                id="cat-overview"
                value={overview}
                onChange={(e) => setOverview(e.target.value)}
                rows={6}
                placeholder="Standard overview text imported onto the quote system..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={isPending}>
              {isPending ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this category?</AlertDialogTitle>
            <AlertDialogDescription>
              This cannot be undone. Systems already using its overview keep their copied text.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={isPending}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
