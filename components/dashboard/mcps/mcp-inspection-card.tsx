'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
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
import { ChevronDown, Camera, Loader2, X, CircleDashed } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Mcp, McpResult } from '@/lib/types/database'

export interface McpInspectionState {
  result: McpResult
  comments: string
  photos: string[]
  touched: boolean
}

interface McpInspectionCardProps {
  mcp: Mcp
  state: McpInspectionState
  disabled?: boolean
  onChange: (next: McpInspectionState) => void
}

export function McpInspectionCard({ mcp, state, disabled = false, onChange }: McpInspectionCardProps) {
  const [open, setOpen] = useState(false)
  const [uploading, setUploading] = useState(false)
  const supabase = createClient()

  const set = (patch: Partial<McpInspectionState>) => onChange({ ...state, ...patch, touched: true })

  const handlePhotos = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    setUploading(true)
    const urls: string[] = []
    for (const file of Array.from(files)) {
      const safeName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, '_')
      const path = `${mcp.id}/inspection/${Date.now()}-${safeName}`
      const { error } = await supabase.storage.from('mcp-photos').upload(path, file, { upsert: false })
      if (error) {
        console.log('[v0] MCP inspection photo upload error:', error.message)
        continue
      }
      const { data } = supabase.storage.from('mcp-photos').getPublicUrl(path)
      urls.push(data.publicUrl)
    }
    setUploading(false)
    set({ photos: [...state.photos, ...urls] })
  }

  const removePhoto = (url: string) => {
    set({ photos: state.photos.filter((p) => p !== url) })
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
      state.result === 'pass'
        ? 'default'
        : state.result === 'fail'
          ? 'destructive'
          : state.result === 'remedial'
            ? 'secondary'
            : 'outline'
    return (
      <Badge variant={variant} className="capitalize">
        {state.result}
      </Badge>
    )
  }

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className={cn(
        'rounded-lg border avoid-break',
        state.touched && state.result === 'fail' && 'border-destructive/50',
        state.touched && state.result === 'remedial' && 'border-amber-500/50',
      )}
    >
      <CollapsibleTrigger className="flex w-full items-center justify-between gap-3 p-4 text-left">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm font-semibold">{mcp.urn}</span>
            {mcp.map_reference && (
              <span className="text-xs text-muted-foreground">Map: {mcp.map_reference}</span>
            )}
          </div>
          <p className="truncate text-sm text-muted-foreground">
            {mcp.location || 'No location set'}
            {mcp.floor ? ` · ${mcp.floor}` : ''}
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

        {(mcp.test_key_type || (mcp.photos && mcp.photos.length > 0)) && (
          <div className="space-y-2 rounded-md bg-muted/50 p-3 text-sm">
            {mcp.test_key_type && (
              <p>
                <span className="text-muted-foreground">Test key: </span>
                {mcp.test_key_type}
              </p>
            )}
            {mcp.photos && mcp.photos.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {mcp.photos.map((url) => (
                  <div key={url} className="h-16 w-16 overflow-hidden rounded-md border">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url || '/placeholder.svg'} alt="Position reference" className="h-full w-full object-cover" />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="grid gap-2">
          <Label>Test result</Label>
          <Select
            value={state.result}
            disabled={disabled}
            onValueChange={(v) => set({ result: v as McpResult })}
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

        <div className="grid gap-2">
          <Label className="text-sm font-semibold">Test photos</Label>
          <div className="flex flex-wrap gap-2">
            {state.photos.map((url) => (
              <div key={url} className="relative h-20 w-20 overflow-hidden rounded-md border">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url || '/placeholder.svg'} alt="Test evidence" className="h-full w-full object-cover" />
                {!disabled && (
                  <button
                    type="button"
                    onClick={() => removePhoto(url)}
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
