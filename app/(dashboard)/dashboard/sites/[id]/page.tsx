import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ArrowLeft, MapPin, Phone, Mail, Building2 } from 'lucide-react'
import { SiteServicesManager } from '@/components/dashboard/sites/site-services-manager'
import type { Profile, Site, Route, ServiceType, SiteService } from '@/lib/types/database'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function SiteDetailPage({ params }: PageProps) {
  const { id } = await params
  const supabase = await createClient()
  
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  if (!profile || (profile as Profile).role === 'engineer') {
    redirect('/dashboard')
  }

  const { data: site } = await supabase
    .from('sites')
    .select(`
      *,
      route:routes(*)
    `)
    .eq('id', id)
    .single()

  if (!site) {
    notFound()
  }

  const [siteServicesResult, serviceTypesResult] = await Promise.all([
    supabase
      .from('site_services')
      .select(`
        *,
        service_type:service_types(*)
      `)
      .eq('site_id', id),
    supabase.from('service_types').select('*').order('name'),
  ])

  const siteServices = (siteServicesResult.data || []) as (SiteService & { service_type: ServiceType })[]
  const serviceTypes = (serviceTypesResult.data || []) as ServiceType[]

  // Filter out service types already added to this site
  const availableServiceTypes = serviceTypes.filter(
    (st) => !siteServices.some((ss) => ss.service_type_id === st.id)
  )

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-4">
        <Button variant="ghost" size="icon" asChild className="mt-1">
          <Link href="/dashboard/sites">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            {(site as Site & { route: Route | null }).route && (
              <Badge variant="secondary">
                {(site as Site & { route: Route | null }).route?.name}
              </Badge>
            )}
          </div>
          <h1 className="text-2xl font-bold">{site.name}</h1>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              Site Details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-start gap-2 text-sm">
              <MapPin className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
              <span>{site.address}</span>
            </div>
            {site.contact_name && (
              <div className="text-sm">
                <span className="text-muted-foreground">Contact: </span>
                {site.contact_name}
              </div>
            )}
            {site.contact_phone && (
              <a href={`tel:${site.contact_phone}`} className="flex items-center gap-2 text-sm text-primary">
                <Phone className="h-4 w-4" />
                {site.contact_phone}
              </a>
            )}
            {site.contact_email && (
              <a href={`mailto:${site.contact_email}`} className="flex items-center gap-2 text-sm text-primary">
                <Mail className="h-4 w-4" />
                {site.contact_email}
              </a>
            )}
            {site.notes && (
              <div className="text-sm pt-2 border-t">
                <span className="text-muted-foreground">Notes: </span>
                {site.notes}
              </div>
            )}
          </CardContent>
        </Card>

        <SiteServicesManager
          siteId={id}
          siteServices={siteServices}
          availableServiceTypes={availableServiceTypes}
        />
      </div>
    </div>
  )
}
