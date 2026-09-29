'use client'

import { PenLine } from 'lucide-react'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { CLIENT_SIGNATURE_OPTIONS } from '@/lib/client-signature'
import type { ClientSignatureMode } from '@/lib/types/database'

interface ClientSignatureFieldProps {
  value: ClientSignatureMode | null
  onChange: (next: ClientSignatureMode | null) => void
}

export function ClientSignatureField({ value, onChange }: ClientSignatureFieldProps) {
  const selected = value ?? 'default'
  const option = CLIENT_SIGNATURE_OPTIONS.find((o) => o.value === selected)
  return (
    <div className="grid gap-2 rounded-lg border border-border p-3">
      <Label htmlFor="client-signature-mode" className="flex items-center gap-2">
        <PenLine className="h-4 w-4 text-primary" />
        Client signature
      </Label>
      <Select
        value={selected}
        onValueChange={(v) => onChange(v === 'default' ? null : (v as ClientSignatureMode))}
      >
        <SelectTrigger id="client-signature-mode" className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {CLIENT_SIGNATURE_OPTIONS.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {option && <p className="text-xs text-muted-foreground text-pretty">{option.description}</p>}
    </div>
  )
}
