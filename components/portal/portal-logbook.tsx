'use client'

import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { LogbookTimeline } from '@/components/logbook/logbook-timeline'
import { BuildingInfoView } from '@/components/logbook/building-info-view'
import { LogbookEntryForm, type LogbookEntryFormValues } from '@/components/logbook/logbook-entry-form'
import { addClientLogbookEntry, type ClientLogbookData } from '@/app/portal/logbook/actions'
import { ArrowLeft } from 'lucide-react'

export function PortalLogbook({ data }: { data: ClientLogbookData }) {
  const router = useRouter()

  async function handleSubmit(values: LogbookEntryFormValues) {
    const result = await addClientLogbookEntry(data.site.id, values)
    if (!result.ok) return result.error ?? 'Could not save entry.'
    router.refresh()
    return null
  }

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/portal/logbook"
          className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          All sites
        </Link>
        <h1 className="text-2xl font-bold tracking-tight text-balance">{data.site.name}</h1>
        <p className="text-muted-foreground">{data.site.address}</p>
      </div>

      <Tabs defaultValue="building" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="building">Building info</TabsTrigger>
          <TabsTrigger value="records">Records</TabsTrigger>
          <TabsTrigger value="add">Add entry</TabsTrigger>
        </TabsList>

        <TabsContent value="building" className="mt-4">
          <BuildingInfoView info={data.buildingInfo} />
        </TabsContent>

        <TabsContent value="records" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Log book records</CardTitle>
              <CardDescription>
                Professional service reports and routine checks, most recent first.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <LogbookTimeline reports={data.reports} entries={data.entries} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="add" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Add a log book entry</CardTitle>
              <CardDescription>
                Record routine checks you carry out, such as the weekly fire alarm test, fire drills
                or staff training.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <LogbookEntryForm onSubmit={handleSubmit} performedByLabel="Your name" />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
