'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { 
  ArrowLeft, 
  Plus, 
  Trash2, 
  GripVertical, 
  Save, 
  Loader2,
  CheckCircle,
  TextCursorInput,
  Hash,
  ToggleLeft,
  GitBranch,
  Camera,
  StickyNote,
  CornerDownRight,
} from 'lucide-react'
import type {
  ChecklistTemplate,
  ServiceType,
  ChecklistItem,
  ChecklistCondition,
  ServiceVisitType,
} from '@/lib/types/database'

interface ChecklistEditorProps {
  checklist: ChecklistTemplate & { service_type: ServiceType }
  visitTypes?: ServiceVisitType[]
}

// Sentinel used by the visit-type Select to represent "applies to all visits"
// (stored as a null visit_type_id).
const ALL_VISITS = '__all__'

const itemTypeIcons = {
  pass_fail: CheckCircle,
  text: TextCursorInput,
  number: Hash,
  checkbox: ToggleLeft,
}

const itemTypeLabels = {
  pass_fail: 'Pass/Fail',
  text: 'Text Input',
  number: 'Number',
  checkbox: 'Checkbox',
}

// Text items have no discrete answer to trigger on, so they can't carry rules.
function supportsConditions(type: ChecklistItem['type']) {
  return type !== 'text'
}

// The sensible default trigger for a freshly-added rule on a given item type.
function defaultTriggerForType(
  type: ChecklistItem['type'],
): Pick<ChecklistCondition, 'when' | 'comparator' | 'threshold'> {
  if (type === 'checkbox') return { when: 'checked' }
  if (type === 'number') return { when: 'number', comparator: 'lt', threshold: 0 }
  // pass_fail (default)
  return { when: 'fail' }
}

// Trigger options offered in the "When answer is…" select, per parent type.
const passFailTriggers = [
  { value: 'fail', label: 'marked Fail' },
  { value: 'advisory', label: 'marked Advisory' },
  { value: 'pass', label: 'marked Pass' },
] as const
const checkboxTriggers = [
  { value: 'checked', label: 'ticked' },
  { value: 'unchecked', label: 'left unticked' },
] as const
const numberComparators = [
  { value: 'gt', label: 'greater than' },
  { value: 'lt', label: 'less than' },
  { value: 'gte', label: 'at least' },
  { value: 'lte', label: 'at most' },
  { value: 'eq', label: 'equal to' },
] as const

export function ChecklistEditor({ checklist, visitTypes = [] }: ChecklistEditorProps) {
  const [items, setItems] = useState<ChecklistItem[]>(checklist.items || [])
  const [name, setName] = useState(checklist.name)
  const [visitTypeId, setVisitTypeId] = useState<string>(checklist.visit_type_id || ALL_VISITS)
  const [saving, setSaving] = useState(false)
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null)
  const router = useRouter()
  const supabase = createClient()

  const addItem = () => {
    const newItem: ChecklistItem = {
      id: crypto.randomUUID(),
      label: '',
      type: 'pass_fail',
      required: true,
    }
    setItems([...items, newItem])
  }

  const updateItem = (id: string, updates: Partial<ChecklistItem>) => {
    setItems(
      items.map((item) => {
        if (item.id !== id) return item
        const next = { ...item, ...updates }
        // When the item type changes, any existing conditional rules may no longer
        // make sense (e.g. a "Fail" trigger on what is now a checkbox). Re-home each
        // rule's trigger to the default for the new type, or drop rules entirely for
        // text items (which cannot be triggered on). Photo/note/follow-up config is
        // preserved.
        if (updates.type && updates.type !== item.type && next.conditions?.length) {
          if (!supportsConditions(updates.type)) {
            next.conditions = []
          } else {
            next.conditions = next.conditions.map((c) => ({
              ...c,
              ...defaultTriggerForType(updates.type as ChecklistItem['type']),
            }))
          }
        }
        return next
      }),
    )
  }

  const removeItem = (id: string) => {
    setItems(items.filter((item) => item.id !== id))
  }

  // --- Conditional rule helpers ---------------------------------------------
  const addCondition = (itemId: string, itemType: ChecklistItem['type']) => {
    const cond: ChecklistCondition = {
      id: crypto.randomUUID(),
      ...defaultTriggerForType(itemType),
    }
    setItems(
      items.map((it) =>
        it.id === itemId ? { ...it, conditions: [...(it.conditions || []), cond] } : it,
      ),
    )
  }

  const updateCondition = (
    itemId: string,
    condId: string,
    updates: Partial<ChecklistCondition>,
  ) => {
    setItems(
      items.map((it) =>
        it.id === itemId
          ? {
              ...it,
              conditions: (it.conditions || []).map((c) =>
                c.id === condId ? { ...c, ...updates } : c,
              ),
            }
          : it,
      ),
    )
  }

  const removeCondition = (itemId: string, condId: string) => {
    setItems(
      items.map((it) =>
        it.id === itemId
          ? { ...it, conditions: (it.conditions || []).filter((c) => c.id !== condId) }
          : it,
      ),
    )
  }

  // Mutate the follow-up question list of a single condition.
  const mutateConditionItems = (
    itemId: string,
    condId: string,
    fn: (children: ChecklistItem[]) => ChecklistItem[],
  ) => {
    setItems(
      items.map((it) =>
        it.id === itemId
          ? {
              ...it,
              conditions: (it.conditions || []).map((c) =>
                c.id === condId ? { ...c, items: fn(c.items || []) } : c,
              ),
            }
          : it,
      ),
    )
  }

  const addConditionItem = (itemId: string, condId: string) => {
    mutateConditionItems(itemId, condId, (children) => [
      ...children,
      { id: crypto.randomUUID(), label: '', type: 'text', required: true },
    ])
  }

  const updateConditionItem = (
    itemId: string,
    condId: string,
    childId: string,
    updates: Partial<ChecklistItem>,
  ) => {
    mutateConditionItems(itemId, condId, (children) =>
      children.map((ch) => (ch.id === childId ? { ...ch, ...updates } : ch)),
    )
  }

  const removeConditionItem = (itemId: string, condId: string, childId: string) => {
    mutateConditionItems(itemId, condId, (children) => children.filter((ch) => ch.id !== childId))
  }

  const handleDragStart = (index: number) => {
    setDraggedIndex(index)
  }

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault()
    if (draggedIndex === null || draggedIndex === index) return

    const newItems = [...items]
    const draggedItem = newItems[draggedIndex]
    newItems.splice(draggedIndex, 1)
    newItems.splice(index, 0, draggedItem)
    setItems(newItems)
    setDraggedIndex(index)
  }

  const handleDragEnd = () => {
    setDraggedIndex(null)
  }

  const handleSave = async () => {
    setSaving(true)
    
    await supabase
      .from('checklist_templates')
      .update({
        name,
        items,
        visit_type_id: visitTypeId === ALL_VISITS ? null : visitTypeId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', checklist.id)

    setSaving(false)
    router.refresh()
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/dashboard/checklists">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Edit Checklist</h1>
            <div className="flex items-center gap-2 text-muted-foreground">
              <Badge variant="secondary">{checklist.service_type?.name}</Badge>
            </div>
          </div>
        </div>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save className="mr-2 h-4 w-4" />
              Save Changes
            </>
          )}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Checklist Details</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 max-w-md">
            <div className="grid gap-2">
              <Label htmlFor="name">Checklist Name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Enter checklist name"
              />
            </div>
            {visitTypes.length > 0 && (
              <div className="grid gap-2">
                <Label htmlFor="visit-type">Applies to visit</Label>
                <Select value={visitTypeId} onValueChange={setVisitTypeId}>
                  <SelectTrigger id="visit-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL_VISITS}>All visits (default)</SelectItem>
                    {visitTypes.map((vt) => (
                      <SelectItem key={vt.id} value={vt.id}>
                        {vt.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Scope this checklist to a specific visit (e.g. Annual or Periodic). &quot;All
                  visits&quot; is the fallback used by any visit without its own checklist.
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Checklist Items</CardTitle>
              <CardDescription>
                Add items to your checklist. Drag to reorder.
              </CardDescription>
            </div>
            <Button onClick={addItem} size="sm">
              <Plus className="mr-2 h-4 w-4" />
              Add Item
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {items.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p>No items yet. Click &quot;Add Item&quot; to get started.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {items.map((item, index) => {
                const Icon = itemTypeIcons[item.type]
                return (
                  <div
                    key={item.id}
                    draggable
                    onDragStart={() => handleDragStart(index)}
                    onDragOver={(e) => handleDragOver(e, index)}
                    onDragEnd={handleDragEnd}
                    className={`border rounded-lg bg-card transition-opacity ${
                      draggedIndex === index ? 'opacity-50' : ''
                    }`}
                  >
                    <div className="flex items-center gap-3 p-4">
                      <div className="cursor-grab text-muted-foreground hover:text-foreground">
                        <GripVertical className="h-5 w-5" />
                      </div>

                      <div className="flex-1 grid gap-3 md:grid-cols-[1fr_150px_auto]">
                        <Input
                          value={item.label}
                          onChange={(e) => updateItem(item.id, { label: e.target.value })}
                          placeholder="Item label (e.g., 'Check smoke detectors')"
                        />

                        <Select
                          value={item.type}
                          onValueChange={(value: ChecklistItem['type']) =>
                            updateItem(item.id, { type: value })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {Object.entries(itemTypeLabels).map(([value, label]) => {
                              const TypeIcon = itemTypeIcons[value as ChecklistItem['type']]
                              return (
                                <SelectItem key={value} value={value}>
                                  <div className="flex items-center gap-2">
                                    <TypeIcon className="h-4 w-4" />
                                    {label}
                                  </div>
                                </SelectItem>
                              )
                            })}
                          </SelectContent>
                        </Select>

                        <div className="flex items-center gap-2">
                          <Checkbox
                            id={`required-${item.id}`}
                            checked={item.required}
                            onCheckedChange={(checked) =>
                              updateItem(item.id, { required: checked as boolean })
                            }
                          />
                          <Label htmlFor={`required-${item.id}`} className="text-sm">
                            Required
                          </Label>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <div className="text-muted-foreground">
                          <Icon className="h-4 w-4" />
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => removeItem(item.id)}
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>

                    {supportsConditions(item.type) && (
                      <ConditionsPanel
                        item={item}
                        onAddCondition={() => addCondition(item.id, item.type)}
                        onUpdateCondition={(condId, updates) =>
                          updateCondition(item.id, condId, updates)
                        }
                        onRemoveCondition={(condId) => removeCondition(item.id, condId)}
                        onAddConditionItem={(condId) => addConditionItem(item.id, condId)}
                        onUpdateConditionItem={(condId, childId, updates) =>
                          updateConditionItem(item.id, condId, childId, updates)
                        }
                        onRemoveConditionItem={(condId, childId) =>
                          removeConditionItem(item.id, condId, childId)
                        }
                      />
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// Per-item panel that manages the conditional rules for a single checklist item.
// Kept as a focused sub-component so the main editor stays readable.
function ConditionsPanel({
  item,
  onAddCondition,
  onUpdateCondition,
  onRemoveCondition,
  onAddConditionItem,
  onUpdateConditionItem,
  onRemoveConditionItem,
}: {
  item: ChecklistItem
  onAddCondition: () => void
  onUpdateCondition: (condId: string, updates: Partial<ChecklistCondition>) => void
  onRemoveCondition: (condId: string) => void
  onAddConditionItem: (condId: string) => void
  onUpdateConditionItem: (
    condId: string,
    childId: string,
    updates: Partial<ChecklistItem>,
  ) => void
  onRemoveConditionItem: (condId: string, childId: string) => void
}) {
  const conditions = item.conditions || []

  return (
    <div className="border-t bg-muted/30 px-4 py-3 space-y-3 rounded-b-lg">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <GitBranch className="h-4 w-4" />
          <span>
            Conditional rules
            {conditions.length > 0 ? ` (${conditions.length})` : ''}
          </span>
        </div>
        <Button variant="outline" size="sm" onClick={onAddCondition}>
          <Plus className="mr-2 h-3.5 w-3.5" />
          Add rule
        </Button>
      </div>

      {conditions.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Optionally require a photo, a note, or extra questions when this item is answered a
          certain way.
        </p>
      ) : (
        <div className="space-y-3">
          {conditions.map((cond) => (
            <div key={cond.id} className="rounded-md border bg-card p-3 space-y-3">
              {/* Trigger row */}
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm text-muted-foreground">When answer is</span>
                {item.type === 'number' ? (
                  <>
                    <Select
                      value={cond.comparator || 'lt'}
                      onValueChange={(v) =>
                        onUpdateCondition(cond.id, {
                          when: 'number',
                          comparator: v as ChecklistCondition['comparator'],
                        })
                      }
                    >
                      <SelectTrigger className="w-[150px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {numberComparators.map((c) => (
                          <SelectItem key={c.value} value={c.value}>
                            {c.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      type="number"
                      className="w-28"
                      value={cond.threshold ?? ''}
                      onChange={(e) =>
                        onUpdateCondition(cond.id, {
                          threshold: e.target.value === '' ? undefined : Number(e.target.value),
                        })
                      }
                      placeholder="value"
                    />
                  </>
                ) : (
                  <Select
                    value={cond.when}
                    onValueChange={(v) =>
                      onUpdateCondition(cond.id, { when: v as ChecklistCondition['when'] })
                    }
                  >
                    <SelectTrigger className="w-[180px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(item.type === 'checkbox' ? checkboxTriggers : passFailTriggers).map((t) => (
                        <SelectItem key={t.value} value={t.value}>
                          {t.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => onRemoveCondition(cond.id)}
                  className="ml-auto text-destructive hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>

              {/* Requirement toggles */}
              <div className="flex flex-wrap items-center gap-4">
                <span className="text-sm text-muted-foreground">Then require:</span>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox
                    checked={!!cond.requirePhoto}
                    onCheckedChange={(c) => onUpdateCondition(cond.id, { requirePhoto: !!c })}
                  />
                  <Camera className="h-4 w-4 text-muted-foreground" />
                  Photo
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox
                    checked={!!cond.requireNote}
                    onCheckedChange={(c) => onUpdateCondition(cond.id, { requireNote: !!c })}
                  />
                  <StickyNote className="h-4 w-4 text-muted-foreground" />
                  Note
                </label>
              </div>

              {/* Follow-up questions */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <CornerDownRight className="h-3.5 w-3.5" />
                    Follow-up questions
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onAddConditionItem(cond.id)}
                    className="h-7"
                  >
                    <Plus className="mr-1 h-3.5 w-3.5" />
                    Add question
                  </Button>
                </div>
                {(cond.items || []).map((child) => (
                  <div
                    key={child.id}
                    className="grid gap-2 md:grid-cols-[1fr_140px_auto_auto] items-center pl-5"
                  >
                    <Input
                      value={child.label}
                      onChange={(e) =>
                        onUpdateConditionItem(cond.id, child.id, { label: e.target.value })
                      }
                      placeholder="Follow-up question"
                    />
                    <Select
                      value={child.type}
                      onValueChange={(v: ChecklistItem['type']) =>
                        onUpdateConditionItem(cond.id, child.id, { type: v })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(itemTypeLabels).map(([value, label]) => (
                          <SelectItem key={value} value={value}>
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <Checkbox
                        checked={child.required}
                        onCheckedChange={(c) =>
                          onUpdateConditionItem(cond.id, child.id, { required: !!c })
                        }
                      />
                      Required
                    </label>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => onRemoveConditionItem(cond.id, child.id)}
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
