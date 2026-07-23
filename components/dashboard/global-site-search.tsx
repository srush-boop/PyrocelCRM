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
  CommandSeparator,
} from '@/components/ui/command'
import {
  Search,
  Building2,
  Users,
  Phone,
  FileText,
  Receipt,
  Briefcase,
  Loader2,
  CalendarDays,
  Plus,
  Inbox,
} from 'lucide-react'

// ── Result shapes ──────────────────────────────────────────────────────────
interface SiteResult {
  id: string
  name: string
  address: string | null
  postcode: string | null
  uprn: string | null
}
interface ClientResult {
  id: string
  name: string
}
interface CallResult {
  id: string
  reference_number: string | null
  status: string
  is_emergency: boolean
  scheduled_date: string | null
}
interface QuoteResult {
  id: string
  quote_number: string | null
  reference: string | null
  title: string | null
  status: string
}
interface InvoiceResult {
  id: string
  invoice_number: string
  status: string
}
interface JobResult {
  id: string
  job_number: string | null
  title: string | null
  status: string
}

interface Results {
  sites: SiteResult[]
  clients: ClientResult[]
  calls: CallResult[]
  quotes: QuoteResult[]
  invoices: InvoiceResult[]
  jobs: JobResult[]
}

const EMPTY: Results = { sites: [], clients: [], calls: [], quotes: [], invoices: [], jobs: [] }

// Quick actions shown when the palette is empty (and filterable by label).
const QUICK_ACTIONS: { label: string; href: string; icon: typeof Search }[] = [
  { label: 'New quote', href: '/dashboard/sales/new', icon: Plus },
  { label: 'Go to Schedule', href: '/dashboard/schedule', icon: CalendarDays },
  { label: 'Go to Clients', href: '/dashboard/clients', icon: Users },
  { label: 'Go to Sites', href: '/dashboard/sites', icon: Building2 },
  { label: 'Go to Quotes', href: '/dashboard/sales/quotes', icon: FileText },
  { label: 'Go to Invoices', href: '/dashboard/invoices', icon: Receipt },
  { label: 'Go to Jobs', href: '/dashboard/jobs', icon: Briefcase },
  { label: 'Go to Requests', href: '/dashboard/requests', icon: Inbox },
]

export function GlobalSiteSearch() {
  const router = useRouter()
  const supabase = createClient()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Results>(EMPTY)
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
      // Only hit the database once there is something meaningful to match, so an
      // empty palette just shows the quick actions instantly.
      if (trimmed.length < 2) {
        setResults(EMPTY)
        setLoading(false)
        return
      }
      const escaped = trimmed.replace(/[%,]/g, ' ')
      setLoading(true)

      // Every entity search is independent, so fire them concurrently and let
      // RLS scope what this user is allowed to see.
      const [sites, clients, calls, quotes, invoices, jobs] = await Promise.all([
        supabase
          .from('sites')
          .select('id, name, address, postcode, uprn')
          .or(
            `name.ilike.%${escaped}%,address.ilike.%${escaped}%,postcode.ilike.%${escaped}%,uprn.ilike.%${escaped}%`,
          )
          .order('name', { ascending: true })
          .limit(6),
        supabase
          .from('clients')
          .select('id, name')
          .ilike('name', `%${escaped}%`)
          .order('name', { ascending: true })
          .limit(6),
        supabase
          .from('tasks')
          .select('id, reference_number, status, is_emergency, scheduled_date')
          .ilike('reference_number', `%${escaped}%`)
          .order('scheduled_date', { ascending: false })
          .limit(6),
        supabase
          .from('quotes')
          .select('id, quote_number, reference, title, status')
          .or(
            `quote_number.ilike.%${escaped}%,reference.ilike.%${escaped}%,title.ilike.%${escaped}%`,
          )
          .order('created_at', { ascending: false })
          .limit(6),
        supabase
          .from('invoices')
          .select('id, invoice_number, status')
          .ilike('invoice_number', `%${escaped}%`)
          .order('created_at', { ascending: false })
          .limit(6),
        supabase
          .from('jobs')
          .select('id, job_number, title, status')
          .or(`job_number.ilike.%${escaped}%,title.ilike.%${escaped}%`)
          .order('created_at', { ascending: false })
          .limit(6),
      ])

      setResults({
        sites: (sites.data as SiteResult[]) ?? [],
        clients: (clients.data as ClientResult[]) ?? [],
        calls: (calls.data as CallResult[]) ?? [],
        quotes: (quotes.data as QuoteResult[]) ?? [],
        invoices: (invoices.data as InvoiceResult[]) ?? [],
        jobs: (jobs.data as JobResult[]) ?? [],
      })
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

  // Reset when the dialog closes.
  useEffect(() => {
    if (!open) {
      setQuery('')
      setResults(EMPTY)
    }
  }, [open])

  const go = (href: string) => {
    setOpen(false)
    router.push(href)
  }

  const hasQuery = query.trim().length >= 2
  const totalResults =
    results.sites.length +
    results.clients.length +
    results.calls.length +
    results.quotes.length +
    results.invoices.length +
    results.jobs.length

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className="gap-2 text-muted-foreground"
      >
        <Search className="h-4 w-4" />
        <span className="hidden sm:inline">Search...</span>
        <kbd className="pointer-events-none hidden h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium sm:inline-flex">
          <span className="text-xs">⌘</span>K
        </kbd>
      </Button>

      <CommandDialog open={open} onOpenChange={setOpen} title="Search" description="Search records or jump to a page">
        <CommandInput
          placeholder="Search sites, clients, calls, quotes, invoices, jobs..."
          value={query}
          onValueChange={setQuery}
        />
        <CommandList>
          {loading && (
            <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Searching...
            </div>
          )}

          {!loading && hasQuery && totalResults === 0 && (
            <CommandEmpty>No matches found.</CommandEmpty>
          )}

          {/* Quick actions — always available; cmdk hides non-matching labels. */}
          <CommandGroup heading="Quick actions">
            {QUICK_ACTIONS.map((action) => (
              <CommandItem
                key={action.href}
                value={action.label}
                onSelect={() => go(action.href)}
                className="flex items-center gap-2"
              >
                <action.icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span>{action.label}</span>
              </CommandItem>
            ))}
          </CommandGroup>

          {!loading && results.sites.length > 0 && (
            <>
              <CommandSeparator />
              <CommandGroup heading="Sites">
                {results.sites.map((site) => (
                  <CommandItem
                    key={site.id}
                    value={`site ${site.name} ${site.address ?? ''} ${site.postcode ?? ''} ${site.uprn ?? ''} ${site.id}`}
                    onSelect={() => go(`/dashboard/sites/${site.id}`)}
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
            </>
          )}

          {!loading && results.clients.length > 0 && (
            <>
              <CommandSeparator />
              <CommandGroup heading="Clients">
                {results.clients.map((client) => (
                  <CommandItem
                    key={client.id}
                    value={`client ${client.name} ${client.id}`}
                    onSelect={() => go('/dashboard/clients')}
                    className="flex items-center gap-2"
                  >
                    <Users className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="font-medium">{client.name}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          )}

          {!loading && results.calls.length > 0 && (
            <>
              <CommandSeparator />
              <CommandGroup heading="Calls">
                {results.calls.map((call) => (
                  <CommandItem
                    key={call.id}
                    value={`call ${call.reference_number ?? ''} ${call.id}`}
                    onSelect={() => go(`/dashboard/tasks/${call.id}`)}
                    className="flex items-start gap-2"
                  >
                    <Phone className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                    <div className="flex flex-col">
                      <span className="font-medium">
                        {call.reference_number ?? 'Call'}
                        {call.is_emergency ? ' · Emergency' : ''}
                      </span>
                      <span className="text-xs capitalize text-muted-foreground">
                        {call.status.replace(/_/g, ' ')}
                        {call.scheduled_date ? ` · ${call.scheduled_date}` : ''}
                      </span>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          )}

          {!loading && results.quotes.length > 0 && (
            <>
              <CommandSeparator />
              <CommandGroup heading="Quotes">
                {results.quotes.map((quote) => (
                  <CommandItem
                    key={quote.id}
                    value={`quote ${quote.quote_number ?? ''} ${quote.reference ?? ''} ${quote.title ?? ''} ${quote.id}`}
                    onSelect={() => go(`/dashboard/sales/${quote.id}`)}
                    className="flex items-start gap-2"
                  >
                    <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                    <div className="flex flex-col">
                      <span className="font-medium">
                        {quote.quote_number ?? quote.reference ?? quote.title ?? 'Quote'}
                      </span>
                      <span className="text-xs capitalize text-muted-foreground">
                        {[quote.title, quote.status?.replace(/_/g, ' ')].filter(Boolean).join(' · ')}
                      </span>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          )}

          {!loading && results.invoices.length > 0 && (
            <>
              <CommandSeparator />
              <CommandGroup heading="Invoices">
                {results.invoices.map((invoice) => (
                  <CommandItem
                    key={invoice.id}
                    value={`invoice ${invoice.invoice_number} ${invoice.id}`}
                    onSelect={() => go(`/dashboard/invoices/${invoice.id}`)}
                    className="flex items-start gap-2"
                  >
                    <Receipt className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                    <div className="flex flex-col">
                      <span className="font-medium">{invoice.invoice_number}</span>
                      <span className="text-xs capitalize text-muted-foreground">
                        {invoice.status?.replace(/_/g, ' ')}
                      </span>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          )}

          {!loading && results.jobs.length > 0 && (
            <>
              <CommandSeparator />
              <CommandGroup heading="Jobs">
                {results.jobs.map((job) => (
                  <CommandItem
                    key={job.id}
                    value={`job ${job.job_number ?? ''} ${job.title ?? ''} ${job.id}`}
                    onSelect={() => go(`/dashboard/jobs/${job.id}`)}
                    className="flex items-start gap-2"
                  >
                    <Briefcase className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                    <div className="flex flex-col">
                      <span className="font-medium">{job.job_number ?? job.title ?? 'Job'}</span>
                      <span className="text-xs capitalize text-muted-foreground">
                        {[job.title, job.status?.replace(/_/g, ' ')].filter(Boolean).join(' · ')}
                      </span>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          )}
        </CommandList>
      </CommandDialog>
    </>
  )
}
