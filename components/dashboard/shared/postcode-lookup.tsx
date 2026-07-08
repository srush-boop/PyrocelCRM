'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2, MapPin, Check } from 'lucide-react'
import type { PostcodeLookupResponse } from '@/app/api/postcode-lookup/route'

interface PostcodeLookupProps {
  // Called with the resolved locality when a lookup succeeds. The parent decides
  // how to apply it (e.g. set the postcode field and append the town/region to
  // the address line).
  onResolved: (result: PostcodeLookupResponse) => void
  // Optional starting value (e.g. an existing postcode when editing).
  initialValue?: string
  label?: string
  id?: string
}

export function PostcodeLookup({
  onResolved,
  initialValue = '',
  label = 'Address finder',
  id = 'postcode-lookup',
}: PostcodeLookupProps) {
  const [value, setValue] = useState(initialValue)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [resolved, setResolved] = useState<string | null>(null)

  const lookup = async () => {
    const q = value.trim()
    if (!q) {
      setError('Enter a postcode to search.')
      return
    }
    setLoading(true)
    setError(null)
    setResolved(null)
    try {
      const res = await fetch(`/api/postcode-lookup?q=${encodeURIComponent(q)}`)
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Could not find that postcode.')
        return
      }
      const result = data as PostcodeLookupResponse
      onResolved(result)
      setResolved(result.locality || result.postcode)
    } catch {
      setError('Address lookup is unavailable right now.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="grid gap-2 rounded-lg border border-dashed p-3">
      <Label htmlFor={id} className="flex items-center gap-1.5 text-sm">
        <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
        {label}
      </Label>
      <div className="flex gap-2">
        <Input
          id={id}
          value={value}
          onChange={(e) => {
            setValue(e.target.value)
            setError(null)
          }}
          placeholder="Enter postcode, e.g. AB12 3CD"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
              e.preventDefault()
              lookup()
            }
          }}
        />
        <Button type="button" variant="outline" onClick={lookup} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Find'}
        </Button>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
      {resolved && !error && (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Check className="h-3.5 w-3.5 text-primary" />
          Filled from <span className="font-medium text-foreground">{resolved}</span>
        </p>
      )}
    </div>
  )
}
