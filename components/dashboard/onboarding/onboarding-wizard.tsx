'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import {
  Check,
  ChevronLeft,
  ChevronRight,
  UserRound,
  Camera,
  PenLine,
  BellRing,
  LayoutDashboard,
  Loader2,
} from 'lucide-react'
import { AvatarManager } from '@/components/dashboard/settings/avatar-manager'
import { SignatureManager } from '@/components/dashboard/settings/signature-manager'
import { PushToggle } from '@/components/dashboard/notifications/push-toggle'
import { DashboardBackgroundPicker } from '@/components/dashboard/home/dashboard-background-picker'
import { saveOnboardingName, completeOnboarding } from '@/app/(dashboard)/onboarding-actions'
import type { Profile } from '@/lib/types/database'

interface OnboardingWizardProps {
  profile: Profile
  /** Office/admin get the dashboard-personalisation step. */
  canPersonaliseDashboard: boolean
}

type StepId = 'name' | 'avatar' | 'signature' | 'notifications' | 'dashboard'

interface StepDef {
  id: StepId
  title: string
  description: string
  icon: typeof UserRound
}

/**
 * First-login profile setup walkthrough. Shown once (gated on the caller by a
 * null `onboarded_at`), it steps the user through the personal settings they
 * control — name, picture, signature, notifications — plus a dashboard
 * personalisation step for office/admin. Every field is reused from the same
 * components that power Settings, so nothing here is a throwaway. Users can skip
 * at any point; skipping or finishing stamps `onboarded_at` so it never returns.
 */
export function OnboardingWizard({ profile, canPersonaliseDashboard }: OnboardingWizardProps) {
  const router = useRouter()
  const [open, setOpen] = useState(true)
  const [index, setIndex] = useState(0)
  const [name, setName] = useState(profile.full_name ?? '')
  const [finishing, startFinishing] = useTransition()
  const [savingName, startSavingName] = useTransition()

  const steps = useMemo<StepDef[]>(() => {
    const list: StepDef[] = [
      {
        id: 'name',
        title: 'Confirm your name',
        description: 'This is how you appear across the app, on reports and in chat.',
        icon: UserRound,
      },
      {
        id: 'avatar',
        title: 'Add a profile picture',
        description: 'Help colleagues recognise you. You can change or remove this any time.',
        icon: Camera,
      },
      {
        id: 'signature',
        title: 'Set your signature',
        description: 'Used to sign off completed inspections, reports and documents.',
        icon: PenLine,
      },
      {
        id: 'notifications',
        title: 'Turn on notifications',
        description: 'Get alerted about calls, approvals and safety check-ins on this device.',
        icon: BellRing,
      },
    ]
    if (canPersonaliseDashboard) {
      list.push({
        id: 'dashboard',
        title: 'Make your dashboard yours',
        description: 'Pick a background now — you can recolour and reorder tiles from your home screen later.',
        icon: LayoutDashboard,
      })
    }
    return list
  }, [canPersonaliseDashboard])

  const total = steps.length
  const step = steps[index]
  const isFirst = index === 0
  const isLast = index === total - 1
  const progress = Math.round(((index + 1) / total) * 100)

  function goNext() {
    // The name step persists before advancing so the value survives a mid-flow skip.
    if (step.id === 'name') {
      const trimmed = name.trim()
      if (!trimmed) {
        toast.error('Please enter your name')
        return
      }
      startSavingName(async () => {
        const res = await saveOnboardingName(trimmed)
        if (!res.ok) {
          toast.error(res.error)
          return
        }
        router.refresh()
        setIndex((i) => Math.min(i + 1, total - 1))
      })
      return
    }
    setIndex((i) => Math.min(i + 1, total - 1))
  }

  function goBack() {
    setIndex((i) => Math.max(i - 1, 0))
  }

  function finish() {
    startFinishing(async () => {
      const res = await completeOnboarding()
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      setOpen(false)
      router.refresh()
    })
  }

  const StepIcon = step.icon

  return (
    <Dialog open={open} onOpenChange={() => { /* modal: dismiss only via Skip/Finish */ }}>
      <DialogContent
        className="max-w-lg gap-0 overflow-hidden p-0 [&>button]:hidden"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <div className="border-b bg-muted/40 px-6 pt-6 pb-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Step {index + 1} of {total}
            </p>
            <button
              type="button"
              onClick={finish}
              disabled={finishing}
              className="text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              Skip for now
            </button>
          </div>
          <Progress value={progress} className="h-1.5" />
          <DialogHeader className="mt-4 space-y-1 text-left">
            <div className="flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary">
                <StepIcon className="h-5 w-5" />
              </span>
              <DialogTitle className="text-lg">{step.title}</DialogTitle>
            </div>
            <DialogDescription className="text-pretty">{step.description}</DialogDescription>
          </DialogHeader>
        </div>

        <div className="min-h-[220px] px-6 py-6">
          {step.id === 'name' && (
            <div className="grid gap-2">
              <Label htmlFor="onboarding-name">Full name</Label>
              <Input
                id="onboarding-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Jane Smith"
                autoFocus
              />
            </div>
          )}

          {step.id === 'avatar' && (
            <AvatarManager avatarUrl={profile.avatar_url} fullName={name || profile.full_name} />
          )}

          {step.id === 'signature' && <SignatureManager signatureUrl={profile.signature_url} />}

          {step.id === 'notifications' && (
            <div className="space-y-3">
              <PushToggle />
              <p className="text-xs text-muted-foreground">
                You can change this later from Settings, or in your browser&apos;s site settings.
              </p>
            </div>
          )}

          {step.id === 'dashboard' && (
            <div className="space-y-4">
              <DashboardBackgroundPicker current={profile.dashboard_background ?? null} />
              <p className="text-xs text-muted-foreground text-pretty">
                Tip: on your home dashboard you can also drag tiles to reorder them and click the colour dot
                on any tile to recolour it.
              </p>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between border-t px-6 py-4">
          <Button type="button" variant="ghost" onClick={goBack} disabled={isFirst || finishing}>
            <ChevronLeft className="mr-1 h-4 w-4" />
            Back
          </Button>
          {isLast ? (
            <Button type="button" onClick={finish} disabled={finishing}>
              {finishing ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Check className="mr-2 h-4 w-4" />
              )}
              Finish
            </Button>
          ) : (
            <Button type="button" onClick={goNext} disabled={savingName}>
              {savingName ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Next
              <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
