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
  ToggleLeft
} from 'lucide-react'
import type { ChecklistTemplate, ServiceType, ChecklistItem, ServiceVisitType } from '@/lib/types/database'

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
    setItems(items.map((item) => (item.id === id ? { ...item, ...updates } : item)))
  }

  const removeItem = (id: string) => {
    setItems(items.filter((item) => item.id !== id))
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
                    className={`flex items-center gap-3 p-4 border rounded-lg bg-card transition-opacity ${
                      draggedIndex === index ? 'opacity-50' : ''
                    }`}
                  >
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
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
