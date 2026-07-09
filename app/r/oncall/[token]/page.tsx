import { notFound } from 'next/navigation'
import { getExternalRota } from '@/lib/oncall/queries'
import { BAND_META } from '@/lib/oncall/types'
import { PhoneCall, AlertTriangle } from 'lucide-react'

// Public, no-auth on-call rota view for the sub-contracted call-handling
// station. Access is granted solely by possession of the unguessable token
// (matched against company_info via the admin client in getExternalRota).
export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ token: string }>
}

function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
}

function todayLabel(): string {
  return new Date().toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

export default async function ExternalOncallPage({ params }: PageProps) {
  const { token } = await params
  const branches = await getExternalRota(token)
  if (!branches) notFound()

  const todayISO = new Date().toISOString().slice(0, 10)

  return (
    <div className="min-h-svh bg-muted/30">
      <div className="mx-auto max-w-3xl p-4 sm:p-6">
        <header className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight text-balance">
            Out-of-hours on-call rota
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{todayLabel()}</p>
          <div className="mt-3 flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden />
            <p className="text-foreground">
              All out-of-hours calls are treated as emergencies. Contact the on-call
              engineer for the relevant branch below.
            </p>
          </div>
        </header>

        <div className="space-y-4">
          {branches.map((b) => {
            const upcoming = b.upcoming.filter((s) => s.shiftDate > todayISO)
            return (
            <section
              key={b.branchId}
              className="overflow-hidden rounded-lg border bg-background"
            >
              <div className="border-b bg-muted/50 px-4 py-2.5">
                <h2 className="font-semibold">{b.branchName}</h2>
              </div>

              <div className="p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  On call now
                </p>
                {b.today && b.today.engineerName ? (
                  <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-lg font-semibold">{b.today.engineerName}</p>
                      <p className="text-xs text-muted-foreground">
                        {BAND_META[b.today.band].label} · {BAND_META[b.today.band].hint}
                      </p>
                    </div>
                    {b.today.phone ? (
                      <a
                        href={`tel:${b.today.phone.replace(/\s+/g, '')}`}
                        className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
                      >
                        <PhoneCall className="h-4 w-4" aria-hidden />
                        {b.today.phone}
                      </a>
                    ) : (
                      <span className="text-sm text-muted-foreground">No number on file</span>
                    )}
                  </div>
                ) : (
                  <p className="mt-1 text-sm text-muted-foreground">
                    No engineer assigned for tonight.
                  </p>
                )}

                {upcoming.length > 0 && (
                  <div className="mt-4 border-t pt-3">
                    <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Upcoming
                    </p>
                    <ul className="divide-y">
                      {upcoming.map((s) => (
                        <li
                          key={`${b.branchId}-${s.shiftDate}`}
                          className="flex items-center justify-between gap-3 py-1.5 text-sm"
                        >
                          <span className="text-muted-foreground">{formatDate(s.shiftDate)}</span>
                          <span className="font-medium">{s.engineerName ?? 'Unassigned'}</span>
                          <span className="text-muted-foreground">{s.phone ?? '—'}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </section>
            )
          })}
        </div>
      </div>
    </div>
  )
}
