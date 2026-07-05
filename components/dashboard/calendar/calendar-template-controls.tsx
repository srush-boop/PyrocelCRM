'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
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
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Bookmark, Check, MoreHorizontal, Save, Star, Trash2 } from 'lucide-react'
import type { CalendarFilterState, CalendarFilterTemplate } from '@/lib/types/database'

interface CalendarTemplateControlsProps {
  templates: CalendarFilterTemplate[]
  // The filters currently applied in the calendar toolbar.
  currentFilters: CalendarFilterState
  // Apply a saved template's filters to the calendar.
  onApply: (filters: CalendarFilterState) => void
}

export function CalendarTemplateControls({
  templates,
  currentFilters,
  onApply,
}: CalendarTemplateControlsProps) {
  const router = useRouter()
  const [saveOpen, setSaveOpen] = useState(false)
  const [name, setName] = useState('')
  const [makeDefault, setMakeDefault] = useState(false)
  const [saving, setSaving] = useState(false)
  const [activeId, setActiveId] = useState<string | null>(null)

  const active = templates.find((t) => t.id === activeId)

  const applyTemplate = (t: CalendarFilterTemplate) => {
    setActiveId(t.id)
    onApply(t.filters)
    toast.success(`Loaded "${t.name}"`)
  }

  const createTemplate = async () => {
    const trimmed = name.trim()
    if (!trimmed) {
      toast.error('Please enter a template name')
      return
    }
    setSaving(true)
    const res = await fetch('/api/calendar-templates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: trimmed, filters: currentFilters, isDefault: makeDefault }),
    })
    setSaving(false)
    if (!res.ok) {
      const { error } = await res.json().catch(() => ({ error: 'Failed to save' }))
      toast.error(error ?? 'Failed to save template')
      return
    }
    setSaveOpen(false)
    setName('')
    setMakeDefault(false)
    toast.success('Template saved')
    router.refresh()
  }

  const patchTemplate = async (id: string, body: Record<string, unknown>, msg: string) => {
    const res = await fetch(`/api/calendar-templates/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      toast.error('Action failed')
      return
    }
    toast.success(msg)
    router.refresh()
  }

  const deleteTemplate = async (id: string) => {
    const res = await fetch(`/api/calendar-templates/${id}`, { method: 'DELETE' })
    if (!res.ok) {
      toast.error('Failed to delete')
      return
    }
    if (activeId === id) setActiveId(null)
    toast.success('Template deleted')
    router.refresh()
  }

  return (
    <div className="flex items-center gap-2">
      {/* Load a saved template */}
      <Select
        value={activeId ?? ''}
        onValueChange={(v) => {
          const t = templates.find((x) => x.id === v)
          if (t) applyTemplate(t)
        }}
      >
        <SelectTrigger className="w-[190px]">
          <span className="flex items-center gap-2 truncate">
            <Bookmark className="h-4 w-4 shrink-0" />
            <SelectValue placeholder="Saved filters" />
          </span>
        </SelectTrigger>
        <SelectContent>
          {templates.length === 0 ? (
            <div className="px-2 py-1.5 text-sm text-muted-foreground">No saved filters yet</div>
          ) : (
            templates.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                <span className="flex items-center gap-1.5">
                  {t.is_default && <Star className="h-3 w-3 fill-current text-amber-500" />}
                  {t.name}
                </span>
              </SelectItem>
            ))
          )}
        </SelectContent>
      </Select>

      <Button variant="outline" size="sm" onClick={() => setSaveOpen(true)}>
        <Save className="mr-2 h-4 w-4" />
        Save filters
      </Button>

      {/* Manage the currently-selected template */}
      {active && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Manage template">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel className="truncate">{active.name}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() =>
                patchTemplate(active.id, { filters: currentFilters }, 'Filters updated')
              }
            >
              <Save className="mr-2 h-4 w-4" />
              Update to current filters
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() =>
                patchTemplate(active.id, { isDefault: !active.is_default },
                  active.is_default ? 'Removed as default' : 'Set as default')
              }
            >
              {active.is_default ? (
                <>
                  <Check className="mr-2 h-4 w-4" />
                  Remove as default
                </>
              ) : (
                <>
                  <Star className="mr-2 h-4 w-4" />
                  Set as default
                </>
              )}
            </DropdownMenuItem>
            <RenameItem
              current={active.name}
              onRename={(newName) => patchTemplate(active.id, { name: newName }, 'Template renamed')}
            />
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={() => deleteTemplate(active.id)}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete template
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      {/* Save dialog */}
      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save current filters</DialogTitle>
            <DialogDescription>
              Give this filter combination a name so you can quickly load it again later.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="template-name">Template name</Label>
              <Input
                id="template-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. My team's leave"
                autoFocus
              />
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="template-default"
                checked={makeDefault}
                onCheckedChange={(c) => setMakeDefault(c === true)}
              />
              <Label htmlFor="template-default" className="font-normal">
                Make this my default (loads automatically)
              </Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveOpen(false)}>
              Cancel
            </Button>
            <Button onClick={createTemplate} disabled={saving}>
              {saving ? 'Saving…' : 'Save template'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// A rename action rendered as a dropdown item that swaps into an inline input.
function RenameItem({
  current,
  onRename,
}: {
  current: string
  onRename: (name: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState(current)

  if (!open) {
    return (
      <DropdownMenuItem
        onSelect={(e) => {
          e.preventDefault()
          setValue(current)
          setOpen(true)
        }}
      >
        <Bookmark className="mr-2 h-4 w-4" />
        Rename
      </DropdownMenuItem>
    )
  }

  return (
    <div className="flex items-center gap-1 px-2 py-1.5" onClick={(e) => e.stopPropagation()}>
      <Input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="h-8"
        autoFocus
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
            const trimmed = value.trim()
            if (trimmed) onRename(trimmed)
            setOpen(false)
          }
        }}
      />
      <Button
        size="sm"
        className="h-8"
        onClick={() => {
          const trimmed = value.trim()
          if (trimmed) onRename(trimmed)
          setOpen(false)
        }}
      >
        Save
      </Button>
    </div>
  )
}
