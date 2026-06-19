'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  CheckCircle2,
  XCircle,
  ChevronDown,
  Camera,
  Loader2,
  X,
  CircleDashed,
} from 'lucide-react'
import { DAMPER_TYPE_LABELS } from '@/lib/dampers'
import { cn } from '@/lib/utils'
import type { Damper, DamperResult, DamperCondition } from '@/lib/types/database'

export interface InspectionState {
  accessible: boolean
  access_notes: string
  drop_test_pass: boolean | null
  fire_barrier_intact: boolean | null
  installation_correct: boolean | null
  fusible_link_ok: boolean | null
  spring_operation_ok: boolean | null
  actuator_ok: boolean | null
  damper_clean: boolean | null
  condition: DamperCondition | null
  overall_result: DamperResult
  remedial_action: string
  comments: string
  photos: string[]
  touched: boolean
}

export const CHECK_ITEMS: { key: keyof InspectionState; label: string }[] = [
  { key: 'drop_test_pass', label: 'Drop test operated correctly' },
  { key: 'spring_operation_ok', label: 'Spring / return mechanism operates' },
  { key: 'actuator_ok', label: 'Actuator / motor operates (if motorised)' },
  { key: 'fusible_link_ok', label: 'Fusible link present & intact' },
  { key: 'fire_barrier_intact', label: 'Fire barrier / penetration seal intact' },
  { key: 'installation_correct', label: 'Installation correct & secure' },
  { key: 'damper_clean', label: 'Damper clean & free of debris' },
]

interface DamperInspectionCardProps {
  damper: Damper
  state: InspectionState
  disabled?: boolean
  onChange: (next: InspectionState) => void
}

export function DamperInspectionCard({
  damper,
  state,
  disabled = false,
  onChange,
}: DamperInspectionCardProps) {
  const [open, setOpen] = useState(false)
  const [uploading, setUploading] = useState(false)
  const supabase = createClient()

  const set = (patch: Partial<InspectionState>) => onChange({ ...state, ...patch, touched: true })

  const handlePhotos = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    setUploading(true)
    const urls: string[] = []
    for (const file of Array.from(files)) {
      const path = `${damper.id}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.\-_]/g, '_')}`
      const { error } = await supabase.storage.from('damper-photos').upload(path, file, {
        upsert: false,
      })
      if (error) {
        console.log('[v0] Photo upload error:', error.message)
        continue
      }
      const { data } = supabase.storage.from('damper-photos').getPublicUrl(path)
      urls.push(data.publicUrl)
    }
    setUploading(false)
    set({ photos: [...state.photos, ...urls] })
  }

  const statusBadge = () => {
    if (!state.touched) {
      return (
        <Badge variant="outline" className="gap-1">
          <CircleDashed className="h-3 w-3" />
          Not tested
        </Badge>
      )
    }
    const variant =
      state.overall_result === 'pass'
        ? 'default'
        : state.overall_result === 'fail'
          ? 'destructive'
          : state.overall_result === 'remedial'
            ? 'secondary'
            : 'outline'
    return (
      <Badge variant={variant} className="capitalize">
        {state.overall_result}
      </Badge>
    )
  }

  const TriState = ({ field }: { field: keyof InspectionState }) => {
    const value = state[field] as boolean | null
    return (
      <div className="flex gap-1.5">
        <Button
          type="button"
          size="sm"
          variant={value === true ? 'default' : 'outline'}
          disabled={disabled}
          onClick={() => set({ [field]: true } as Partial<InspectionState>)}
          className={cn('h-8 px-3', value === true && 'bg-green-600 hover:bg-green-700')}
        >
          <CheckCircle2 className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          size="sm"
          variant={value === false ? 'default' : 'outline'}
          disabled={disabled}
          onClick={() => set({ [field]: false } as Partial<InspectionState>)}
          className={cn('h-8 px-3', value === false && 'bg-destructive hover:bg-destructive/90')}
        >
          <XCircle className="h-4 w-4" />
        </Button>
      </div>
    )
  }

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className={cn(
        'rounded-lg border avoid-break',
        state.touched && state.overall_result === 'fail' && 'border-destructive/50',
        state.touched && state.overall_result === 'remedial' && 'border-amber-500/50',
      )}
    >
      <CollapsibleTrigger className="flex w-full items-center justify-between gap-3 p-4 text-left">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm font-semibold">{damper.urn}</span>
            <span className="text-xs text-muted-foreground">
              {DAMPER_TYPE_LABELS[damper.damper_type]}
            </span>
          </div>
          <p className="truncate text-sm text-muted-foreground">
            {damper.location || damper.reference || 'No location set'}
            {damper.floor ? ` · ${damper.floor}` : ''}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {statusBadge()}
          <ChevronDown
            className={cn('h-4 w-4 text-muted-foreground transition-transform', open && 'rotate-180')}
          />
        </div>
      </CollapsibleTrigger>

      <CollapsibleContent className="space-y-4 px-4 pb-4">
        <Separator />

        <div className="flex items-center justify-between rounded-md bg-muted/50 px-3 py-2">
          <Label htmlFor={`acc-${damper.id}`} className="text-sm font-medium">
            Accessible for testing?
          </Label>
          <Switch
            id={`acc-${damper.id}`}
            checked={state.accessible}
            disabled={disabled}
            onCheckedChange={(checked) =>
              set(
                checked
                  ? { accessible: true, overall_result: 'pass' }
                  : { accessible: false, overall_result: 'na' },
              )
            }
          />
        </div>

        {!state.accessible ? (
          <div className="grid gap-2">
            <Label htmlFor={`an-${damper.id}`}>Reason / access notes</Label>
            <Textarea
              id={`an-${damper.id}`}
              value={state.access_notes}
              disabled={disabled}
              onChange={(e) => set({ access_notes: e.target.value })}
              placeholder="e.g. No access panel, obstructed by ductwork…"
            />
          </div>
        ) : (
          <div className="space-y-3">
            {CHECK_ITEMS.map((item) => (
              <div key={item.key} className="flex items-center justify-between gap-3">
                <span className="text-sm">{item.label}</span>
                <TriState field={item.key} />
              </div>
            ))}

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label>Condition</Label>
                <Select
                  value={state.condition ?? ''}
                  disabled={disabled}
                  onValueChange={(v) => set({ condition: v as DamperCondition })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="good">Good</SelectItem>
                    <SelectItem value="fair">Fair</SelectItem>
                    <SelectItem value="poor">Poor</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Overall result</Label>
                <Select
                  value={state.overall_result}
                  disabled={disabled}
                  onValueChange={(v) => set({ overall_result: v as DamperResult })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pass">Pass</SelectItem>
                    <SelectItem value="remedial">Remedial</SelectItem>
                    <SelectItem value="fail">Fail</SelectItem>
                    <SelectItem value="na">N/A</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {(state.overall_result === 'fail' || state.overall_result === 'remedial') && (
              <div className="grid gap-2">
                <Label>Remedial action required</Label>
                <Textarea
                  value={state.remedial_action}
                  disabled={disabled}
                  onChange={(e) => set({ remedial_action: e.target.value })}
                  placeholder="Describe the fault and recommended remedial work…"
                />
              </div>
            )}
          </div>
        )}

        <div className="grid gap-2">
          <Label>Comments</Label>
          <Textarea
            value={state.comments}
            disabled={disabled}
            onChange={(e) => set({ comments: e.target.value })}
            placeholder="Optional notes…"
            rows={2}
          />
        </div>

        {/* Photos */}
        <div className="grid gap-2">
          <Label>Photos</Label>
          <div className="flex flex-wrap gap-2">
            {state.photos.map((url) => (
              <div key={url} className="relative h-20 w-20 overflow-hidden rounded-md border">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url || '/placeholder.svg'} alt="Damper inspection" className="h-full w-full object-cover" />
                {!disabled && (
                  <button
                    type="button"
                    onClick={() => set({ photos: state.photos.filter((p) => p !== url) })}
                    className="absolute right-0.5 top-0.5 rounded-full bg-background/80 p-0.5"
                    aria-label="Remove photo"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
            ))}
            {!disabled && (
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
            )}
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}
