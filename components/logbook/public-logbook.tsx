'use client'

import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { LogbookTimeline } from '@/components/logbook/logbook-timeline'
import { LogbookEntryForm, type LogbookEntryFormValues } from '@/components/logbook/logbook-entry-form'
import { BuildingInfoForm } from '@/components/dashboard/sites/building-info-form'
import { LogbookPublicControls } from '@/components/logbook/logbook-public-controls'
import {
  addOccupierEntry,
  saveOccupierBuildingInfo,
  type PublicLogbookData,
} from '@/app/logbook/[siteId]/actions'

export function PublicLogbook({
  data,
  isStaff = false,
  passwordProtected = false,
}: {
  data: PublicLogbookData
  isStaff?: boolean
  passwordProtected?: boolean
}) {
  const router = useRouter()

  async function handleSubmit(values: LogbookEntryFormValues) {
    const result = await addOccupierEntry(data.site.id, values)
    if (!result.ok) return result.error ?? 'Could not save entry.'
    router.refresh()
    return null
  }

  return (
    <main className="mx-auto min-h-screen max-w-3xl space-y-6 p-4 sm:p-6">
      <header className="flex items-center gap-3 border-b pb-4">
        <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-md border bg-white p-1">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/images/pyrocel-logo.png"
            alt="Pyrocel Fire and Security logo"
            className="h-full w-full object-contain"
          />
        </div>
        <div className="flex-1">
          <h1 className="text-lg font-semibold leading-tight text-balance">Fire Safety Log Book</h1>
          <p className="text-sm text-muted-foreground">
            {data.site.name} · {data.site.address}
          </p>
          {isStaff && (
            <p className="mt-0.5 text-xs text-muted-foreground">
              Viewing as Pyrocel staff{passwordProtected ? ' — this log book is password protected for clients.' : '.'}
            </p>
          )}
        </div>
      </header>

      <LogbookPublicControls
        siteId={data.site.id}
        siteName={data.site.name}
        siteAddress={data.site.address}
        passwordProtected={passwordProtected}
      />

      <Tabs defaultValue="timeline" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="timeline">Log book</TabsTrigger>
          <TabsTrigger value="building">Building info</TabsTrigger>
          <TabsTrigger value="add">Add entry</TabsTrigger>
        </TabsList>

        <TabsContent value="timeline" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Records</CardTitle>
              <CardDescription>
                Professional service reports and routine checks, most recent first.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <LogbookTimeline reports={data.reports} entries={data.entries} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="building" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">General building information</CardTitle>
              <CardDescription>
                Keep the responsible person, competent person, Fire Risk Assessment and emergency
                contacts up to date for this premises.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <BuildingInfoForm
                siteId={data.site.id}
                info={data.buildingInfo}
                onSave={saveOccupierBuildingInfo}
                submitLabel="Save building information"
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="add" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Add a log book entry</CardTitle>
              <CardDescription>
                Record routine checks you carry out, such as the weekly fire alarm test.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <LogbookEntryForm onSubmit={handleSubmit} performedByLabel="Your name" />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <p className="pb-6 text-center text-xs text-muted-foreground">
        Maintained in line with BS 5839-1 and BS 5266-1 fire safety record-keeping guidance.
      </p>
    </main>
  )
}
