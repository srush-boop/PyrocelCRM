'use client'

import { useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { BookOpen } from 'lucide-react'
import { LogbookTimeline, type ReportTimelineItem } from '@/components/logbook/logbook-timeline'
import { LogbookEntryForm, type LogbookEntryFormValues } from '@/components/logbook/logbook-entry-form'
import { LogbookQrCard } from '@/components/dashboard/sites/logbook-qr-card'
import { BuildingInfoForm } from '@/components/dashboard/sites/building-info-form'
import { addStaffLogbookEntry } from '@/app/(dashboard)/dashboard/sites/[id]/logbook-actions'
import type { LogbookEntry, SiteBuildingInfo } from '@/lib/types/database'

interface SiteLogbookProps {
  siteId: string
  siteName: string
  siteAddress: string
  postcode: string | null
  reports: ReportTimelineItem[]
  entries: LogbookEntry[]
  buildingInfo: SiteBuildingInfo | null
}

export function SiteLogbook({
  siteId,
  siteName,
  siteAddress,
  postcode,
  reports,
  entries,
  buildingInfo,
}: SiteLogbookProps) {
  const router = useRouter()

  async function handleSubmit(values: LogbookEntryFormValues) {
    const result = await addStaffLogbookEntry(siteId, values)
    if (!result.ok) return result.error ?? 'Could not save entry.'
    router.refresh()
    return null
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BookOpen className="h-5 w-5" />
          Log Book
        </CardTitle>
        <CardDescription>
          Electronic fire safety log book combining professional service reports with routine checks.
          Print the QR poster for occupiers to scan on site.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="timeline" className="w-full">
          <TabsList>
            <TabsTrigger value="timeline">Records</TabsTrigger>
            <TabsTrigger value="building">Building info</TabsTrigger>
            <TabsTrigger value="add">Add entry</TabsTrigger>
            <TabsTrigger value="qr">QR poster</TabsTrigger>
          </TabsList>

          <TabsContent value="timeline" className="mt-4">
            <LogbookTimeline reports={reports} entries={entries} />
          </TabsContent>

          <TabsContent value="building" className="mt-4">
            <BuildingInfoForm siteId={siteId} info={buildingInfo} />
          </TabsContent>

          <TabsContent value="add" className="mt-4 max-w-2xl">
            <LogbookEntryForm onSubmit={handleSubmit} />
          </TabsContent>

          <TabsContent value="qr" className="mt-4">
            <LogbookQrCard
              siteId={siteId}
              siteName={siteName}
              siteAddress={siteAddress}
              postcode={postcode}
            />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  )
}
