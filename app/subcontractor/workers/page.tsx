import { redirect } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Mail, User } from 'lucide-react'
import { getSubcontractorContext, getCompanyWorkers } from '@/lib/subcontractor/portal-data'

export default async function WorkersPage() {
  const ctx = await getSubcontractorContext()
  // Only the company lead manages/views the worker list.
  if (!ctx.isLead) redirect('/subcontractor')

  const workers = await getCompanyWorkers(ctx)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Workers</h1>
        <p className="text-muted-foreground">
          The people in your company who can be issued calls. Workers are set up by the Pyrocel
          office — contact them to add or remove a worker.
        </p>
      </div>

      {workers.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No workers have been set up for your company yet.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {workers.map((worker) => (
            <Card key={worker.id}>
              <CardContent className="flex items-center gap-4 py-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                  <User className="h-5 w-5" aria-hidden="true" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate font-medium text-foreground">
                      {worker.fullName || 'Unnamed worker'}
                    </p>
                    {worker.isLead && <Badge variant="secondary">Lead</Badge>}
                  </div>
                  <p className="flex items-center gap-1 truncate text-sm text-muted-foreground">
                    <Mail className="h-3 w-3" aria-hidden="true" />
                    {worker.email}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-semibold tabular-nums">{worker.openCallCount}</p>
                  <p className="text-xs text-muted-foreground">open calls</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
