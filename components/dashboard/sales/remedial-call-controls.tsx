'use client'

import { useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Wrench, Plus, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { createRemedialCallForQuoteManually } from '@/app/(dashboard)/dashboard/sales/actions'

interface RemedialCallControlsProps {
  quoteId: string
  /** Only remedial quotes can raise remedial calls. */
  isRemedial: boolean
  /** The manual create action is only offered once the quote is accepted. */
  isAccepted: boolean
  /** Remedial calls already raised from this quote. */
  calls: { id: string; reference_number: string | null }[]
}

/**
 * Header controls on the quote page for the remedial-call link. Once a remedial
 * call exists it links straight to it; otherwise (accepted remedial quote with
 * no call yet) it offers a manual "Create remedial call" button as a fallback to
 * the automatic creation at acceptance.
 */
export function RemedialCallControls({ quoteId, isRemedial, isAccepted, calls }: RemedialCallControlsProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  if (!isRemedial) return null

  if (calls.length > 0) {
    return (
      <>
        {calls.map((c) => (
          <Button key={c.id} variant="outline" size="sm" className="w-fit" asChild>
            <Link href={`/dashboard/tasks/${c.id}`}>
              <Wrench className="mr-2 h-4 w-4" />
              View remedial call{c.reference_number ? ` ${c.reference_number}` : ''}
            </Link>
          </Button>
        ))}
      </>
    )
  }

  if (!isAccepted) return null

  const onCreate = () => {
    startTransition(async () => {
      const res = await createRemedialCallForQuoteManually(quoteId)
      if (!res.ok) {
        toast.error(res.error ?? 'Could not create the remedial call.')
        return
      }
      if ((res.created ?? 0) > 0) {
        toast.success(`Raised ${res.created} remedial call${res.created === 1 ? '' : 's'}.`)
      } else {
        toast.info('No remedial call was created — it may already exist or have no site to anchor to.')
      }
      router.refresh()
    })
  }

  return (
    <Button variant="outline" size="sm" className="w-fit" onClick={onCreate} disabled={isPending}>
      {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
      Create remedial call
    </Button>
  )
}
