'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Search, Building2, Loader2 } from 'lucide-react'

interface SiteResult {
  id: string
  name: string
  address: string | null
  postcode: string | null
  uprn: string | null
}

export function GlobalSiteSearch() {
  const router = useRouter()
  const supabase = createClient()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SiteResult[]>([])
  const [loading, setLoading] = useState(false)

  // Open with Cmd/Ctrl+K from anywhere in the dashboard.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen((prev) => !prev)
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])

  const runSearch = useCallback(
    async (term: string) => {
      const trimmed = term.trim()
      setLoading(true)
      // Match against name, address, postcode, or UPRN.
      let request = supabase
        .from('sites')
        .select('id, name, address, postcode, uprn')
        .order('name', { ascending: true })
        .limit(20)

      if (trimmed) {
        const escaped = trimmed.replace(/[%,]/g, ' ')
        request = request.or(
          `name.ilike.%${escaped}%,address.ilike.%${escaped}%,postcode.ilike.%${escaped}%,uprn.ilike.%${escaped}%`,
        )
      }

      const { data, error } = await request
      if (error) {
        console.log('[v0] Global site search error:', error.message)
        setResults([])
      } else {
        setResults((data as SiteResult[]) ?? [])
      }
      setLoading(false)
    },
    [supabase],
  )

  // Debounced search whenever the dialog is open and the query changes.
  useEffect(() => {
    if (!open) return
    const handle = setTimeout(() => runSearch(query), 200)
    return () => clearTimeout(handle)
  }, [open, query, runSearch])

  // Reset the query each time the dialog closes.
  useEffect(() => {
    if (!open) setQuery('')
  }, [open])

  const handleSelect = (siteId: string) => {
    setOpen(false)
    router.push(`/dashboard/sites/${siteId}`)
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className="gap-2 text-muted-foreground"
      >
        <Search className="h-4 w-4" />
        <span className="hidden sm:inline">Search sites...</span>
        <kbd className="pointer-events-none hidden h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium sm:inline-flex">
          <span className="text-xs">⌘</span>K
        </kbd>
      </Button>

      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput
          placeholder="Search by site name, address, postcode, or UPRN..."
          value={query}
          onValueChange={setQuery}
        />
        <CommandList>
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Searching...
            </div>
          ) : (
            <CommandEmpty>No sites found.</CommandEmpty>
          )}
          {!loading && results.length > 0 && (
            <CommandGroup heading="Sites">
              {results.map((site) => (
                <CommandItem
                  key={site.id}
                  // Include identifiers in the value so cmdk's built-in
                  // filtering keeps matches visible across all fields.
                  value={`${site.name} ${site.address ?? ''} ${site.postcode ?? ''} ${site.uprn ?? ''} ${site.id}`}
                  onSelect={() => handleSelect(site.id)}
                  className="flex items-start gap-2"
                >
                  <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="flex flex-col">
                    <span className="font-medium">{site.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {[site.address, site.postcode].filter(Boolean).join(', ') || 'No address'}
                      {site.uprn ? ` · UPRN ${site.uprn}` : ''}
                    </span>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
        </CommandList>
      </CommandDialog>
    </>
  )
}
