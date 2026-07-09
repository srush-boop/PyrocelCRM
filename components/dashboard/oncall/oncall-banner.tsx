import Link from 'next/link'
import { LifeBuoy } from 'lucide-react'
import { getMyCurrentOncall } from '@/lib/oncall/queries'
import { BAND_META } from '@/lib/oncall/types'

// A persistent reminder shown across the dashboard when the signed-in user is
// the on-call engineer for the current out-of-hours shift. Rendered server-side
// in the dashboard layout so it appears on every page.
export async function OncallBanner() {
  const onCall = await getMyCurrentOncall()
  if (!onCall) return null
  const band = BAND_META[onCall.band]

  return (
    <Link
      href="/dashboard/oncall"
      className="flex items-center gap-2 border-b border-primary/20 bg-primary/10 px-4 py-2 text-sm text-foreground transition-colors hover:bg-primary/15 md:px-6"
    >
      <LifeBuoy className="h-4 w-4 shrink-0 text-primary" aria-hidden />
      <span className="font-medium">You are on call tonight</span>
      <span className="text-muted-foreground">
        {onCall.branchName} · {band.label} rate
      </span>
      <span className="ml-auto text-xs text-primary underline-offset-2 hover:underline">
        View rota
      </span>
    </Link>
  )
}
