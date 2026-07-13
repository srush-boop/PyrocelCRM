'use client'

import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Search, Loader2, MapPin, Phone } from 'lucide-react'
import type { PlaceResult } from '@/app/api/places-search/route'

interface AddressFinderProps {
  /** Called when the user picks a business/address from the results. */
  onSelect: (place: PlaceResult) => void
  /** Placeholder for the search box. */
  placeholder?: string
  /** Label shown above the finder. */
  label?: string
  /** Optional helper text under the label. */
  hint?: string
}

/**
 * Business / address finder backed by Google Places (via /api/places-search).
 * Search by business name OR address; picking a result hands the caller the
 * name, full address, postcode, phone and website so it can fill its own form.
 */
export function AddressFinder({
  onSelect,
  placeholder = 'Search business name or address…',
  label = 'Find business or address',
  hint,
}: AddressFinderProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<PlaceResult[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Debounced search whenever the query changes and is long enough.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    const q = query.trim()
    if (q.length < 3) {
      setResults([])
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/places-search?q=${encodeURIComponent(q)}`)
        const data = await res.json()
        if (!res.ok) {
          setError(data.error ?? 'Lookup failed.')
          setResults([])
        } else {
          setResults(data.results ?? [])
        }
      } catch {
        setError('Lookup failed.')
        setResults([])
      } finally {
        setLoading(false)
      }
    }, 350)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query])

  const handleSelect = (place: PlaceResult) => {
    onSelect(place)
    setOpen(false)
    setQuery('')
    setResults([])
  }

  return (
    <div className="grid gap-1.5">
      {label && <span className="text-sm font-medium">{label}</span>}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            className="justify-start gap-2 font-normal text-muted-foreground"
          >
            <Search className="h-4 w-4" />
            {placeholder}
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="w-[--radix-popover-trigger-width] p-0"
          align="start"
          onOpenAutoFocus={(e) => {
            e.preventDefault()
            inputRef.current?.focus()
          }}
        >
          <div className="border-b p-2">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={placeholder}
                className="pl-8"
              />
              {loading && (
                <Loader2 className="absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
              )}
            </div>
          </div>
          <div className="max-h-72 overflow-y-auto p-1">
            {error && <p className="px-2 py-3 text-sm text-destructive">{error}</p>}
            {!error && query.trim().length < 3 && (
              <p className="px-2 py-3 text-sm text-muted-foreground">
                Type at least 3 characters to search.
              </p>
            )}
            {!error && !loading && query.trim().length >= 3 && results.length === 0 && (
              <p className="px-2 py-3 text-sm text-muted-foreground">No matches found.</p>
            )}
            {results.map((r) => (
              <button
                key={r.placeId}
                type="button"
                onClick={() => handleSelect(r)}
                className="flex w-full flex-col gap-0.5 rounded-md px-2 py-2 text-left hover:bg-accent"
              >
                <span className="text-sm font-medium">{r.name}</span>
                <span className="flex items-start gap-1 text-xs text-muted-foreground">
                  <MapPin className="mt-0.5 h-3 w-3 shrink-0" />
                  {r.address}
                </span>
                {r.phone && (
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Phone className="h-3 w-3 shrink-0" />
                    {r.phone}
                  </span>
                )}
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </div>
  )
}
