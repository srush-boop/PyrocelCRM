'use client'

import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Label } from '@/components/ui/label'
import { SERVICE_COLOR_OPTIONS } from '@/lib/service-colors'

interface ServiceColorPickerProps {
  value: string
  onChange: (value: string) => void
}

export function ServiceColorPicker({ value, onChange }: ServiceColorPickerProps) {
  return (
    <div className="grid gap-2">
      <Label>Colour scheme</Label>
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Colour scheme">
        {SERVICE_COLOR_OPTIONS.map((option) => {
          const selected = option.value.toLowerCase() === value.toLowerCase()
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={option.label}
              title={option.label}
              onClick={() => onChange(option.value)}
              className={cn(
                'flex h-9 w-9 items-center justify-center rounded-full ring-offset-background transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                selected ? 'ring-2 ring-ring ring-offset-2' : 'hover:scale-105',
              )}
              style={{ backgroundColor: option.value }}
            >
              {selected && <Check className="h-4 w-4 text-white" aria-hidden="true" />}
            </button>
          )
        })}
      </div>
      <p className="text-xs text-muted-foreground">
        Used to colour this service&apos;s report headers and accents.
      </p>
    </div>
  )
}
