'use client'

import { useCallback, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  Search,
  Plus,
  Pencil,
  Trash2,
  Loader2,
  Sparkles,
  AlertCircle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
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
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  KNOWLEDGE_TYPE_LABELS,
  KNOWLEDGE_TYPE_ORDER,
  IMPORTANCE_LABELS,
  IMPORTANCE_ORDER,
  type TenderKnowledgeItem,
  type TenderKnowledgeType,
  type TenderImportance,
} from '@/lib/tender/types'

interface KnowledgeCentreProps {
  items: TenderKnowledgeItem[]
}

const IMPORTANCE_STYLES: Record<TenderImportance, string> = {
  critical: 'bg-destructive/10 text-destructive border-destructive/20',
  high: 'bg-chart-4/15 text-foreground border-chart-4/30',
  normal: 'bg-muted text-muted-foreground border-transparent',
}

interface DraftState {
  id?: string
  knowledge_type: TenderKnowledgeType
  title: string
  content: string
  importance: TenderImportance
  tags: string
}

const EMPTY_DRAFT: DraftState = {
  knowledge_type: 'company_info',
  title: '',
  content: '',
  importance: 'normal',
  tags: '',
}

export function KnowledgeCentre({ items }: KnowledgeCentreProps) {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState<TenderKnowledgeType | 'all'>('all')

  const [dialogOpen, setDialogOpen] = useState(false)
  const [draft, setDraft] = useState<DraftState>(EMPTY_DRAFT)
  const [saving, setSaving] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Client-side filtering across title, content and tags. Semantic search is a
  // separate feature (the AI answering path); here we keep the list responsive.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return items.filter((item) => {
      if (typeFilter !== 'all' && item.knowledge_type !== typeFilter) return false
      if (!q) return true
      return (
        item.title.toLowerCase().includes(q) ||
        item.content.toLowerCase().includes(q) ||
        item.tags.some((t) => t.toLowerCase().includes(q))
      )
    })
  }, [items, query, typeFilter])

  const counts = useMemo(() => {
    const map = new Map<string, number>()
    for (const item of items) {
      map.set(item.knowledge_type, (map.get(item.knowledge_type) ?? 0) + 1)
    }
    return map
  }, [items])

  const openCreate = useCallback(() => {
    setDraft(EMPTY_DRAFT)
    setDialogOpen(true)
  }, [])

  const openEdit = useCallback((item: TenderKnowledgeItem) => {
    setDraft({
      id: item.id,
      knowledge_type: item.knowledge_type,
      title: item.title,
      content: item.content,
      importance: item.importance,
      tags: item.tags.join(', '),
    })
    setDialogOpen(true)
  }, [])

  const handleSave = useCallback(async () => {
    if (!draft.title.trim() || !draft.content.trim()) {
      toast.error('Title and content are required')
      return
    }
    setSaving(true)
    try {
      const payload = {
        knowledge_type: draft.knowledge_type,
        title: draft.title.trim(),
        content: draft.content.trim(),
        importance: draft.importance,
        tags: draft.tags
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
      }
      const res = await fetch(
        draft.id ? `/api/tender/knowledge/${draft.id}` : '/api/tender/knowledge',
        {
          method: draft.id ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
      )
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? 'Failed to save')
      }
      toast.success(draft.id ? 'Knowledge updated and re-indexed' : 'Knowledge added and indexed')
      setDialogOpen(false)
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }, [draft, router])

  const handleDelete = useCallback(async () => {
    if (!deleteId) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/tender/knowledge/${deleteId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to delete')
      toast.success('Knowledge removed')
      setDeleteId(null)
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete')
    } finally {
      setDeleting(false)
    }
  }, [deleteId, router])

  return (
    <div className="flex flex-col gap-6">
      {/* Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-md">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search knowledge by title, content or tag..."
            className="pl-9"
            aria-label="Search knowledge"
          />
        </div>
        <Button onClick={openCreate} className="shrink-0">
          <Plus className="size-4" />
          Add knowledge
        </Button>
      </div>

      {/* Type filter */}
      <Tabs value={typeFilter} onValueChange={(v) => setTypeFilter(v as TenderKnowledgeType | 'all')}>
        <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1 bg-muted/50 p-1">
          <TabsTrigger value="all" className="gap-1.5">
            All
            <span className="text-xs text-muted-foreground">{items.length}</span>
          </TabsTrigger>
          {KNOWLEDGE_TYPE_ORDER.map((type) => (
            <TabsTrigger key={type} value={type} className="gap-1.5">
              {KNOWLEDGE_TYPE_LABELS[type]}
              <span className="text-xs text-muted-foreground">{counts.get(type) ?? 0}</span>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {/* List */}
      {filtered.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <div className="flex size-12 items-center justify-center rounded-full bg-muted">
              <Sparkles className="size-6 text-muted-foreground" />
            </div>
            <div>
              <p className="font-medium">No knowledge found</p>
              <p className="text-sm text-muted-foreground text-pretty">
                {query || typeFilter !== 'all'
                  ? 'Try adjusting your search or filter.'
                  : 'Add company knowledge so the AI can draw on it when answering tenders.'}
              </p>
            </div>
            {!query && typeFilter === 'all' && (
              <Button onClick={openCreate} variant="outline">
                <Plus className="size-4" />
                Add your first item
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((item) => (
            <Card key={item.id} className="flex flex-col">
              <CardHeader className="gap-2 pb-3">
                <div className="flex items-start justify-between gap-2">
                  <Badge variant="outline" className="font-normal">
                    {KNOWLEDGE_TYPE_LABELS[item.knowledge_type]}
                  </Badge>
                  <Badge variant="outline" className={IMPORTANCE_STYLES[item.importance]}>
                    {item.importance === 'critical' && <AlertCircle className="size-3" />}
                    {IMPORTANCE_LABELS[item.importance]}
                  </Badge>
                </div>
                <h3 className="font-semibold leading-snug text-balance">{item.title}</h3>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col gap-3 pt-0">
                <p className="line-clamp-4 flex-1 text-sm leading-relaxed text-muted-foreground">
                  {item.content}
                </p>
                {item.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {item.tags.map((tag) => (
                      <span
                        key={tag}
                        className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
                <div className="flex items-center justify-end gap-1 border-t pt-3">
                  <Button variant="ghost" size="sm" onClick={() => openEdit(item)}>
                    <Pencil className="size-3.5" />
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    onClick={() => setDeleteId(item.id)}
                  >
                    <Trash2 className="size-3.5" />
                    Delete
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Add / edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{draft.id ? 'Edit knowledge' : 'Add knowledge'}</DialogTitle>
            <DialogDescription>
              This content is embedded and retrieved by the AI when drafting tender answers.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="k-type">Type</Label>
                <Select
                  value={draft.knowledge_type}
                  onValueChange={(v) =>
                    setDraft((d) => ({ ...d, knowledge_type: v as TenderKnowledgeType }))
                  }
                >
                  <SelectTrigger id="k-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {KNOWLEDGE_TYPE_ORDER.map((type) => (
                      <SelectItem key={type} value={type}>
                        {KNOWLEDGE_TYPE_LABELS[type]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="k-importance">Importance</Label>
                <Select
                  value={draft.importance}
                  onValueChange={(v) =>
                    setDraft((d) => ({ ...d, importance: v as TenderImportance }))
                  }
                >
                  <SelectTrigger id="k-importance">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {IMPORTANCE_ORDER.map((imp) => (
                      <SelectItem key={imp} value={imp}>
                        {IMPORTANCE_LABELS[imp]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="k-title">Title</Label>
              <Input
                id="k-title"
                value={draft.title}
                onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
                placeholder="e.g. ISO 9001 Quality Management certification"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="k-content">Content</Label>
              <Textarea
                id="k-content"
                value={draft.content}
                onChange={(e) => setDraft((d) => ({ ...d, content: e.target.value }))}
                placeholder="The detailed information the AI should use..."
                rows={8}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="k-tags">Tags</Label>
              <Input
                id="k-tags"
                value={draft.tags}
                onChange={(e) => setDraft((d) => ({ ...d, tags: e.target.value }))}
                placeholder="Comma separated, e.g. quality, iso, accreditation"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="size-4 animate-spin" />}
              {draft.id ? 'Save changes' : 'Add knowledge'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={deleteId !== null} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this knowledge?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the item and its AI index entry. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                handleDelete()
              }}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting && <Loader2 className="size-4 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
