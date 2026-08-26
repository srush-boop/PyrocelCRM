'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { MoreHorizontal, Send, BarChart3, Megaphone, Loader2, Lock } from 'lucide-react'
import type { InternalTaskTemplate } from '@/lib/types/database'
import {
  publishSurvey,
  closeSurvey,
  sendSurveySummary,
} from '@/lib/actions/surveys'

// Admin-only lifecycle controls for a single survey row: publish (distribute to
// respondents), view results, send the summary, and close.
export function SurveyRowActions({ template }: { template: InternalTaskTemplate }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [confirmPublish, setConfirmPublish] = useState(false)
  const [confirmClose, setConfirmClose] = useState(false)

  const isPublished = Boolean(template.survey_published_at)
  const isClosed = Boolean(template.survey_closed_at)

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, success: string) {
    startTransition(async () => {
      const res = await fn()
      if (res.ok) {
        toast.success(success)
        router.refresh()
      } else {
        toast.error(res.error ?? 'Something went wrong')
      }
    })
  }

  return (
    <>
      {!isPublished && !isClosed ? (
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() => setConfirmPublish(true)}
        >
          {pending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Megaphone className="size-4" />
          )}
          Publish
        </Button>
      ) : null}

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" disabled={pending}>
            <MoreHorizontal className="size-4" />
            <span className="sr-only">Survey actions</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem asChild>
            <Link href={`/dashboard/surveys/${template.id}`}>
              <BarChart3 className="size-4" />
              View results
            </Link>
          </DropdownMenuItem>
          {isPublished ? (
            <DropdownMenuItem
              onClick={() =>
                run(() => sendSurveySummary(template.id), 'Summary sent')
              }
            >
              <Send className="size-4" />
              Send summary now
            </DropdownMenuItem>
          ) : null}
          {isPublished && !isClosed ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setConfirmClose(true)}>
                <Lock className="size-4" />
                Close survey
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={confirmPublish} onOpenChange={setConfirmPublish}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Publish this survey?</AlertDialogTitle>
            <AlertDialogDescription>
              This sends &quot;{template.name}&quot; to everyone in its audience and
              notifies them to respond. You can send the results summary at any
              time afterwards.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                run(() => publishSurvey(template.id), 'Survey published')
              }
            >
              Publish
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmClose} onOpenChange={setConfirmClose}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Close this survey?</AlertDialogTitle>
            <AlertDialogDescription>
              Staff will no longer be able to respond to &quot;{template.name}&quot;.
              The results summary is sent automatically when a survey closes.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => run(() => closeSurvey(template.id), 'Survey closed')}
            >
              Close survey
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
