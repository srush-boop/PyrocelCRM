'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Building, Building2, Wrench, Search, ChevronLeft, ChevronRight } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { DocumentBrowser } from '@/components/documents/document-browser'
import type {
  Client,
  DocumentFile,
  DocumentFolder,
  DocumentOwnerType,
  Site,
} from '@/lib/types/database'

type SiteServiceLite = {
  id: string
  site_id: string
  service_type: { name: string } | null
}

interface DocumentsExplorerProps {
  clients: Pick<Client, 'id' | 'name'>[]
  sites: Pick<Site, 'id' | 'name' | 'client_id'>[]
  siteServices: SiteServiceLite[]
  selected:
    | {
        ownerType: DocumentOwnerType
        ownerId: string
        folders: DocumentFolder[]
        files: DocumentFile[]
      }
    | null
  canManage: boolean
}

// Only these owner types are browsable in the top-level documents explorer.
// (site_engineer is surfaced on the site's "Engineer Info" tab, not here.)
type BrowsableOwnerType = 'client' | 'site' | 'site_service'

const TAB_META: Record<
  BrowsableOwnerType,
  { label: string; icon: typeof Building }
> = {
  client: { label: 'Clients', icon: Building },
  site: { label: 'Sites', icon: Building2 },
  site_service: { label: 'Services', icon: Wrench },
}

export function DocumentsExplorer({
  clients,
  sites,
  siteServices,
  selected,
  canManage,
}: DocumentsExplorerProps) {
  const router = useRouter()
  const [tab, setTab] = useState<BrowsableOwnerType>(
    (selected?.ownerType as BrowsableOwnerType) ?? 'client',
  )
  const [query, setQuery] = useState('')

  const siteName = useMemo(
    () => new Map(sites.map((s) => [s.id, s.name])),
    [sites],
  )

  // Build the selectable list for the active tab.
  const items = useMemo(() => {
    if (tab === 'client') {
      return clients.map((c) => ({ id: c.id, label: c.name, sub: 'Client' }))
    }
    if (tab === 'site') {
      return sites.map((s) => ({ id: s.id, label: s.name, sub: 'Site' }))
    }
    return siteServices.map((ss) => ({
      id: ss.id,
      label: ss.service_type?.name ?? 'Service',
      sub: siteName.get(ss.site_id) ?? 'Site',
    }))
  }, [tab, clients, sites, siteServices, siteName])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return items
    return items.filter(
      (i) => i.label.toLowerCase().includes(q) || i.sub.toLowerCase().includes(q),
    )
  }, [items, query])

  function selectOwner(id: string) {
    router.push(`/dashboard/documents?ownerType=${tab}&ownerId=${id}`)
  }

  // Resolve a friendly title for the selected owner.
  const selectedLabel = useMemo(() => {
    if (!selected) return ''
    if (selected.ownerType === 'client')
      return clients.find((c) => c.id === selected.ownerId)?.name ?? 'Client'
    if (selected.ownerType === 'site')
      return sites.find((s) => s.id === selected.ownerId)?.name ?? 'Site'
    const ss = siteServices.find((s) => s.id === selected.ownerId)
    return ss ? `${ss.service_type?.name ?? 'Service'} · ${siteName.get(ss.site_id) ?? ''}` : 'Service'
  }, [selected, clients, sites, siteServices, siteName])

  if (selected) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.push('/dashboard/documents')}
          >
            <ChevronLeft className="mr-1 h-4 w-4" />
            Back
          </Button>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              {TAB_META[selected.ownerType as BrowsableOwnerType].label.replace(/s$/, '')}
            </p>
            <h2 className="text-lg font-semibold">{selectedLabel}</h2>
          </div>
        </div>
        <DocumentBrowser
          ownerType={selected.ownerType}
          ownerId={selected.ownerId}
          folders={selected.folders}
          files={selected.files}
          canManage={canManage}
        />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <Tabs value={tab} onValueChange={(v) => setTab(v as BrowsableOwnerType)}>
        <TabsList>
          {(Object.keys(TAB_META) as BrowsableOwnerType[]).map((key) => {
            const Icon = TAB_META[key].icon
            return (
              <TabsTrigger key={key} value={key}>
                <Icon className="mr-2 h-4 w-4" />
                {TAB_META[key].label}
              </TabsTrigger>
            )
          })}
        </TabsList>
      </Tabs>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder={`Search ${TAB_META[tab].label.toLowerCase()}...`}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="pl-9"
        />
      </div>

      {filtered.length === 0 ? (
        <Card className="p-10 text-center text-sm text-muted-foreground">
          No {TAB_META[tab].label.toLowerCase()} found.
        </Card>
      ) : (
        <Card className="divide-y">
          {filtered.map((item) => {
            const Icon = TAB_META[tab].icon
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => selectOwner(item.id)}
                className="flex w-full cursor-pointer items-center gap-3 p-3 text-left transition-colors hover:bg-muted/50"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{item.label}</p>
                  <p className="truncate text-sm text-muted-foreground">{item.sub}</p>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              </button>
            )
          })}
        </Card>
      )}
    </div>
  )
}
