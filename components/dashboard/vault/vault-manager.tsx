'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Checkbox } from '@/components/ui/checkbox'
import { Card } from '@/components/ui/card'
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
import { Plus, Pencil, Trash2, Loader2, ExternalLink } from 'lucide-react'
import { toast } from 'sonner'
import { getVaultIcon, VAULT_ICON_KEYS } from '@/lib/vault-icons'
import type { UserRole, VaultSection, VaultButton } from '@/lib/types/database'

const ROLE_OPTIONS: { value: UserRole; label: string }[] = [
  { value: 'admin', label: 'Admin' },
  { value: 'office', label: 'Office' },
  { value: 'engineer', label: 'Engineer' },
  { value: 'client', label: 'Client' },
]

interface VaultManagerProps {
  sections: VaultSection[]
}

export function VaultManager({ sections }: VaultManagerProps) {
  const router = useRouter()
  const supabase = createClient()

  // Section dialog state
  const [sectionDialogOpen, setSectionDialogOpen] = useState(false)
  const [editingSection, setEditingSection] = useState<VaultSection | null>(null)
  const [sectionForm, setSectionForm] = useState({
    title: '',
    description: '',
    visible_roles: ['admin', 'office', 'engineer'] as UserRole[],
  })

  // Button dialog state
  const [buttonDialogOpen, setButtonDialogOpen] = useState(false)
  const [editingButton, setEditingButton] = useState<VaultButton | null>(null)
  const [buttonSectionId, setButtonSectionId] = useState<string | null>(null)
  const [buttonForm, setButtonForm] = useState({
    label: '',
    url: '',
    description: '',
    icon: 'link',
    open_in_new_tab: true,
    visible_roles: ['admin', 'office', 'engineer'] as UserRole[],
  })

  const [deleteTarget, setDeleteTarget] = useState<
    { kind: 'section' | 'button'; id: string; name: string } | null
  >(null)
  const [saving, setSaving] = useState(false)

  // ---------- Section helpers ----------
  function openNewSection() {
    setEditingSection(null)
    setSectionForm({
      title: '',
      description: '',
      visible_roles: ['admin', 'office', 'engineer'],
    })
    setSectionDialogOpen(true)
  }

  function openEditSection(section: VaultSection) {
    setEditingSection(section)
    setSectionForm({
      title: section.title,
      description: section.description ?? '',
      visible_roles: section.visible_roles,
    })
    setSectionDialogOpen(true)
  }

  async function saveSection() {
    if (!sectionForm.title.trim()) {
      toast.error('Please enter a section title')
      return
    }
    if (sectionForm.visible_roles.length === 0) {
      toast.error('Select at least one role that can view this section')
      return
    }
    setSaving(true)
    const payload = {
      title: sectionForm.title.trim(),
      description: sectionForm.description.trim() || null,
      visible_roles: sectionForm.visible_roles,
    }
    const { error } = editingSection
      ? await supabase.from('vault_sections').update(payload).eq('id', editingSection.id)
      : await supabase
          .from('vault_sections')
          .insert({ ...payload, sort_order: sections.length })
    setSaving(false)
    if (error) {
      toast.error(error.message)
      return
    }
    toast.success(editingSection ? 'Section updated' : 'Section created')
    setSectionDialogOpen(false)
    router.refresh()
  }

  // ---------- Button helpers ----------
  function openNewButton(sectionId: string) {
    setEditingButton(null)
    setButtonSectionId(sectionId)
    setButtonForm({
      label: '',
      url: '',
      description: '',
      icon: 'link',
      open_in_new_tab: true,
      visible_roles: ['admin', 'office', 'engineer'],
    })
    setButtonDialogOpen(true)
  }

  function openEditButton(button: VaultButton) {
    setEditingButton(button)
    setButtonSectionId(button.section_id)
    setButtonForm({
      label: button.label,
      url: button.url,
      description: button.description ?? '',
      icon: button.icon ?? 'link',
      open_in_new_tab: button.open_in_new_tab,
      visible_roles: button.visible_roles,
    })
    setButtonDialogOpen(true)
  }

  async function saveButton() {
    if (!buttonForm.label.trim()) {
      toast.error('Please enter a button label')
      return
    }
    let url = buttonForm.url.trim()
    if (!url) {
      toast.error('Please enter a URL')
      return
    }
    // Allow relative in-app links (starting with /) or absolute URLs; prefix
    // bare domains with https://.
    if (!url.startsWith('/') && !/^https?:\/\//i.test(url)) {
      url = `https://${url}`
    }
    if (buttonForm.visible_roles.length === 0) {
      toast.error('Select at least one role that can view this button')
      return
    }
    const section = sections.find((s) => s.id === buttonSectionId)
    setSaving(true)
    const payload = {
      section_id: buttonSectionId,
      label: buttonForm.label.trim(),
      url,
      description: buttonForm.description.trim() || null,
      icon: buttonForm.icon,
      open_in_new_tab: buttonForm.open_in_new_tab,
      visible_roles: buttonForm.visible_roles,
    }
    const { error } = editingButton
      ? await supabase.from('vault_buttons').update(payload).eq('id', editingButton.id)
      : await supabase
          .from('vault_buttons')
          .insert({ ...payload, sort_order: section?.buttons?.length ?? 0 })
    setSaving(false)
    if (error) {
      toast.error(error.message)
      return
    }
    toast.success(editingButton ? 'Button updated' : 'Button added')
    setButtonDialogOpen(false)
    router.refresh()
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    setSaving(true)
    const table = deleteTarget.kind === 'section' ? 'vault_sections' : 'vault_buttons'
    const { error } = await supabase.from(table).delete().eq('id', deleteTarget.id)
    setSaving(false)
    if (error) {
      toast.error(error.message)
      return
    }
    toast.success(`${deleteTarget.kind === 'section' ? 'Section' : 'Button'} deleted`)
    setDeleteTarget(null)
    router.refresh()
  }

  function toggleRole(
    current: UserRole[],
    role: UserRole,
    setter: (roles: UserRole[]) => void,
  ) {
    setter(
      current.includes(role) ? current.filter((r) => r !== role) : [...current, role],
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Button onClick={openNewSection}>
          <Plus className="mr-2 h-4 w-4" />
          Add Section
        </Button>
      </div>

      {sections.length === 0 ? (
        <Card className="p-10 text-center text-muted-foreground">
          No sections yet. Add your first section to start building the vault.
        </Card>
      ) : (
        sections.map((section) => (
          <Card key={section.id} className="p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-lg font-semibold">{section.title}</h3>
                  {section.visible_roles.map((r) => (
                    <Badge key={r} variant="secondary" className="text-[10px] capitalize">
                      {r}
                    </Badge>
                  ))}
                </div>
                {section.description && (
                  <p className="mt-1 text-sm text-muted-foreground text-pretty">
                    {section.description}
                  </p>
                )}
              </div>
              <div className="flex shrink-0 gap-1">
                <Button variant="ghost" size="icon" onClick={() => openEditSection(section)}>
                  <Pencil className="h-4 w-4" />
                  <span className="sr-only">Edit section</span>
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() =>
                    setDeleteTarget({ kind: 'section', id: section.id, name: section.title })
                  }
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                  <span className="sr-only">Delete section</span>
                </Button>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {(section.buttons ?? []).map((button) => {
                const Icon = getVaultIcon(button.icon)
                return (
                  <div
                    key={button.id}
                    className="flex items-center gap-3 rounded-md border p-3"
                  >
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1 font-medium leading-tight">
                        <span className="truncate">{button.label}</span>
                        {button.open_in_new_tab && (
                          <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground" />
                        )}
                      </div>
                      <p className="truncate text-xs text-muted-foreground">{button.url}</p>
                    </div>
                    <div className="flex shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => openEditButton(button)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        <span className="sr-only">Edit button</span>
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() =>
                          setDeleteTarget({
                            kind: 'button',
                            id: button.id,
                            name: button.label,
                          })
                        }
                      >
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        <span className="sr-only">Delete button</span>
                      </Button>
                    </div>
                  </div>
                )
              })}
              <Button
                variant="outline"
                className="h-auto justify-start border-dashed py-3 text-muted-foreground"
                onClick={() => openNewButton(section.id)}
              >
                <Plus className="mr-2 h-4 w-4" />
                Add button
              </Button>
            </div>
          </Card>
        ))
      )}

      {/* Section dialog */}
      <Dialog open={sectionDialogOpen} onOpenChange={setSectionDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingSection ? 'Edit Section' : 'Add Section'}</DialogTitle>
            <DialogDescription>
              Sections group related buttons together on the Employee Vault.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="section-title">Title</Label>
              <Input
                id="section-title"
                value={sectionForm.title}
                onChange={(e) => setSectionForm({ ...sectionForm, title: e.target.value })}
                placeholder="e.g. Forms"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="section-description">Description (optional)</Label>
              <Textarea
                id="section-description"
                value={sectionForm.description}
                onChange={(e) =>
                  setSectionForm({ ...sectionForm, description: e.target.value })
                }
                placeholder="Short description shown under the title"
                rows={2}
              />
            </div>
            <div className="grid gap-2">
              <Label>Visible to</Label>
              <div className="flex flex-wrap gap-4">
                {ROLE_OPTIONS.map((role) => (
                  <label key={role.value} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={sectionForm.visible_roles.includes(role.value)}
                      onCheckedChange={() =>
                        toggleRole(sectionForm.visible_roles, role.value, (roles) =>
                          setSectionForm({ ...sectionForm, visible_roles: roles }),
                        )
                      }
                    />
                    {role.label}
                  </label>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSectionDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={saveSection} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editingSection ? 'Save changes' : 'Create section'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Button dialog */}
      <Dialog open={buttonDialogOpen} onOpenChange={setButtonDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingButton ? 'Edit Button' : 'Add Button'}</DialogTitle>
            <DialogDescription>
              Link to an in-app page (e.g. /dashboard/reports) or an external URL such as a
              Jotform form or Dropbox folder.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="button-label">Label</Label>
              <Input
                id="button-label"
                value={buttonForm.label}
                onChange={(e) => setButtonForm({ ...buttonForm, label: e.target.value })}
                placeholder="e.g. Holiday Request Form"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="button-url">URL</Label>
              <Input
                id="button-url"
                value={buttonForm.url}
                onChange={(e) => setButtonForm({ ...buttonForm, url: e.target.value })}
                placeholder="https://form.jotform.com/... or /dashboard/reports"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="button-description">Description (optional)</Label>
              <Textarea
                id="button-description"
                value={buttonForm.description}
                onChange={(e) =>
                  setButtonForm({ ...buttonForm, description: e.target.value })
                }
                rows={2}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="button-icon">Icon</Label>
                <Select
                  value={buttonForm.icon}
                  onValueChange={(value) => setButtonForm({ ...buttonForm, icon: value })}
                >
                  <SelectTrigger id="button-icon">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {VAULT_ICON_KEYS.map((key) => {
                      const Icon = getVaultIcon(key)
                      return (
                        <SelectItem key={key} value={key}>
                          <span className="flex items-center gap-2 capitalize">
                            <Icon className="h-4 w-4" />
                            {key}
                          </span>
                        </SelectItem>
                      )
                    })}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="button-newtab">Open in new tab</Label>
                <div className="flex h-10 items-center">
                  <Switch
                    id="button-newtab"
                    checked={buttonForm.open_in_new_tab}
                    onCheckedChange={(checked) =>
                      setButtonForm({ ...buttonForm, open_in_new_tab: checked })
                    }
                  />
                </div>
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Visible to</Label>
              <div className="flex flex-wrap gap-4">
                {ROLE_OPTIONS.map((role) => (
                  <label key={role.value} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={buttonForm.visible_roles.includes(role.value)}
                      onCheckedChange={() =>
                        toggleRole(buttonForm.visible_roles, role.value, (roles) =>
                          setButtonForm({ ...buttonForm, visible_roles: roles }),
                        )
                      }
                    />
                    {role.label}
                  </label>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                A button is only shown when its parent section is also visible to the role.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setButtonDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={saveButton} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editingButton ? 'Save changes' : 'Add button'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {deleteTarget?.kind === 'section' ? 'section' : 'button'}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.kind === 'section'
                ? `"${deleteTarget?.name}" and all of its buttons will be permanently removed.`
                : `"${deleteTarget?.name}" will be permanently removed.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                confirmDelete()
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
