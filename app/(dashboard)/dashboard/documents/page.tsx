import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getAllDocumentTags, getOwnerDocuments, getSystemReferences } from '@/lib/documents/data'
import { DocumentsExplorer } from '@/components/documents/documents-explorer'
import type { SystemTypeLite } from '@/components/documents/system-references-manager'
import type {
  Client,
  DocumentOwnerType,
  Profile,
  Site,
} from '@/lib/types/database'

const OWNER_TYPES: DocumentOwnerType[] = ['client', 'site', 'site_service']

interface PageProps {
  searchParams: Promise<{ ownerType?: string; ownerId?: string }>
}

export default async function DocumentsPage({ searchParams }: PageProps) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  const role = (profile as Profile | null)?.role
  if (!role || !['admin', 'office', 'engineer'].includes(role)) {
    redirect('/dashboard')
  }
  const canManage = role === 'admin' || role === 'office'
  const canManageReferences = role === 'admin'

  // Picker data: clients, sites, and each site's services (with names), plus the
  // active system types and the system reference library for the AI guide tab.
  const [
    { data: clients },
    { data: sites },
    { data: siteServices },
    { data: systemTypeRows },
    systemReferences,
    allTags,
  ] = await Promise.all([
    supabase.from('clients').select('id, name').order('name'),
    supabase.from('sites').select('id, name, client_id').order('name'),
    supabase
      .from('site_services')
      .select('id, site_id, service_type:service_types(name)')
      .order('created_at'),
    supabase
      .from('system_types')
      .select('id, name, code')
      .eq('active', true)
      .order('position'),
    getSystemReferences(),
    getAllDocumentTags(),
  ])

  const systemTypes = (systemTypeRows ?? []) as SystemTypeLite[]

  const { ownerType: rawType, ownerId } = await searchParams
  const ownerType = (OWNER_TYPES.includes(rawType as DocumentOwnerType)
    ? rawType
    : undefined) as DocumentOwnerType | undefined

  const selected =
    ownerType && ownerId
      ? { ownerType, ownerId, ...(await getOwnerDocuments(ownerType, ownerId)) }
      : null

  // Supabase returns joined relations as arrays; flatten service_type to a single object.
  const normalizedServices = ((siteServices || []) as {
    id: string
    site_id: string
    service_type: { name: string }[] | { name: string } | null
  }[]).map((ss) => ({
    id: ss.id,
    site_id: ss.site_id,
    service_type: Array.isArray(ss.service_type)
      ? (ss.service_type[0] ?? null)
      : ss.service_type,
  }))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Documents</h1>
        <p className="text-muted-foreground">
          Store and organise files for clients, sites, and individual services.
        </p>
      </div>

      <DocumentsExplorer
        clients={(clients || []) as Pick<Client, 'id' | 'name'>[]}
        sites={(sites || []) as Pick<Site, 'id' | 'name' | 'client_id'>[]}
        siteServices={normalizedServices}
        selected={selected}
        canManage={canManage}
        allTags={allTags}
        systemTypes={systemTypes}
        systemReferences={systemReferences}
        canManageReferences={canManageReferences}
      />
    </div>
  )
}
