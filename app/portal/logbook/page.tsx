import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent } from '@/components/ui/card'
import { getClientSites } from './actions'
import { BookText, ChevronRight, MapPin } from 'lucide-react'

export default async function PortalLogbookPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const sites = await getClientSites()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Fire Safety Log Book</h1>
        <p className="text-muted-foreground">
          Select a site to view its building information and log book records
        </p>
      </div>

      {sites.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No sites are currently linked to your account. Please contact Pyrocel.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {sites.map((site) => (
            <Link key={site.id} href={`/portal/logbook/${site.id}`} className="block">
              <Card className="transition-colors hover:border-primary/50 hover:bg-muted/40">
                <CardContent className="flex items-center gap-4 py-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                    <BookText className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-foreground">{site.name}</p>
                    <p className="flex items-center gap-1 truncate text-sm text-muted-foreground">
                      <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      {site.address || 'No address on file'}
                    </p>
                  </div>
                  <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
