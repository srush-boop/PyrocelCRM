'use client'

import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { LogbookTimeline } from '@/components/logbook/logbook-timeline'
import { LogbookEntryForm, type LogbookEntryFormValues } from '@/components/logbook/logbook-entry-form'
import { addOccupierEntry, type PublicLogbookData } from '@/app/logbook/[siteId]/actions'
import { Flame } from 'lucide-react'

export function PublicLogbook({ data }: { data: PublicLogbookData }) {
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
        <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <Flame className="h-5 w-5" aria-hidden="true" />
        </div>
        <div>
          <h1 className="text-lg font-semibold leading-tight text-balance">Fire Safety Log Book</h1>
          <p className="text-sm text-muted-foreground">
            {data.site.name} · {data.site.address}
          </p>
        </div>
      </header>

      <Tabs defaultValue="timeline" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="timeline">Log book</TabsTrigger>
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
