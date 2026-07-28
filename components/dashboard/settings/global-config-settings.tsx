'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { setGlobalConfig } from '@/lib/actions/global-config'
import { OPENING_HOURS_KEY, type OpeningHours } from '@/lib/oncall/opening-hours'
import { Loader2, Plus, Trash2, Save, Crown, Clock, ShieldOff } from 'lucide-react'

interface GlobalConfigSettingsProps {
  poOverdueDays: number
  deadlineReasons: string[]
  excludedReasons: string[]
  engagementStatsEnabled: boolean
  openingHours: OpeningHours
}

export function GlobalConfigSettings({
  poOverdueDays: initialOverdueDays,
  deadlineReasons: initialReasons,
  excludedReasons: initialExcluded,
  engagementStatsEnabled: initialEngagementEnabled,
  openingHours: initialOpeningHours,
}: GlobalConfigSettingsProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  // Company opening hours — drives on-call windows and "out of hours" logic.
  const [openTime, setOpenTime] = useState(initialOpeningHours.open)
  const [closeTime, setCloseTime] = useState(initialOpeningHours.close)
  const [weekendWorking, setWeekendWorking] = useState(initialOpeningHours.weekendWorking)
  const [savingHours, setSavingHours] = useState(false)

  const saveOpeningHours = async () => {
    if (openTime >= closeTime) {
      toast.error('Closing time must be after opening time')
      return
    }
    setSavingHours(true)
    const value: OpeningHours = { open: openTime, close: closeTime, weekendWorking }
    const { error } = await setGlobalConfig(OPENING_HOURS_KEY, value)
    setSavingHours(false)
    if (error) {
      toast.error(error)
    } else {
      toast.success('Opening hours saved')
      startTransition(() => router.refresh())
    }
  }

  // Engineer encouragement / standings feature
  const [engagementEnabled, setEngagementEnabled] = useState(initialEngagementEnabled)
  const [savingEngagement, setSavingEngagement] = useState(false)

  const toggleEngagement = async (next: boolean) => {
    setEngagementEnabled(next)
    setSavingEngagement(true)
    const { error } = await setGlobalConfig('engagement_stats_enabled', next)
    setSavingEngagement(false)
    if (error) {
      setEngagementEnabled(!next) // revert on failure
      toast.error(error)
    } else {
      toast.success(next ? 'Engineer standings enabled' : 'Engineer standings hidden')
      startTransition(() => router.refresh())
    }
  }

  // PO overdue threshold
  const [overdueDays, setOverdueDays] = useState(String(initialOverdueDays))
  const [savingOverdue, setSavingOverdue] = useState(false)

  // Deadline failed reasons list + the subset excluded from KPI calculations.
  const [reasons, setReasons] = useState<string[]>(initialReasons)
  const [excluded, setExcluded] = useState<string[]>(initialExcluded)
  const [newReason, setNewReason] = useState('')
  const [savingReasons, setSavingReasons] = useState(false)

  const saveOverdueDays = async () => {
    const val = parseInt(overdueDays, 10)
    if (isNaN(val) || val < 1) {
      toast.error('Please enter a valid number of days (1 or more)')
      return
    }
    setSavingOverdue(true)
    const { error } = await setGlobalConfig('po_request_overdue_days', val)
    setSavingOverdue(false)
    if (error) {
      toast.error(error)
    } else {
      toast.success('Overdue threshold saved')
      startTransition(() => router.refresh())
    }
  }

  const addReason = () => {
    const r = newReason.trim()
    if (!r) return
    if (reasons.includes(r)) {
      toast.error('That reason already exists')
      return
    }
    setReasons((prev) => [...prev, r])
    setNewReason('')
  }

  const removeReason = (r: string) => {
    setReasons((prev) => prev.filter((x) => x !== r))
    // Keep the exclusion list in sync so it never references a deleted reason.
    setExcluded((prev) => prev.filter((x) => x !== r))
  }

  // Rename a reason in place, migrating its exclusion flag to the new label.
  const renameReason = (oldName: string, next: string) => {
    const trimmed = next.trim()
    if (!trimmed || trimmed === oldName) return
    if (reasons.includes(trimmed)) {
      toast.error('That reason already exists')
      return
    }
    setReasons((prev) => prev.map((x) => (x === oldName ? trimmed : x)))
    setExcluded((prev) => prev.map((x) => (x === oldName ? trimmed : x)))
  }

  const toggleExcluded = (r: string, next: boolean) => {
    setExcluded((prev) => (next ? [...new Set([...prev, r])] : prev.filter((x) => x !== r)))
  }

  const saveReasons = async () => {
    if (reasons.length === 0) {
      toast.error('Add at least one reason')
      return
    }
    setSavingReasons(true)
    // Persist the reason list and the excludable subset (kept to existing reasons).
    const cleanExcluded = excluded.filter((x) => reasons.includes(x))
    const [{ error: e1 }, { error: e2 }] = await Promise.all([
      setGlobalConfig('deadline_failed_reasons', reasons),
      setGlobalConfig('deadline_failed_reason_exclusions', cleanExcluded),
    ])
    setSavingReasons(false)
    const error = e1 || e2
    if (error) {
      toast.error(error)
    } else {
      toast.success('Deadline reasons saved')
      startTransition(() => router.refresh())
    }
  }

  return (
    <div className="space-y-6">
      {/* Company opening hours */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-primary" />
            Opening Hours
          </CardTitle>
          <CardDescription>
            Your standard weekday opening and closing times. These define when the business is
            &quot;out of hours&quot;: evening on-call cover starts at closing time and hands over
            at the next opening time. Used by the on-call rota and out-of-hours logic.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="opening-open">Opens (Mon&ndash;Fri)</Label>
              <Input
                id="opening-open"
                type="time"
                value={openTime}
                onChange={(e) => setOpenTime(e.target.value)}
                className="w-36"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="opening-close">Closes (Mon&ndash;Fri)</Label>
              <Input
                id="opening-close"
                type="time"
                value={closeTime}
                onChange={(e) => setCloseTime(e.target.value)}
                className="w-36"
              />
            </div>
          </div>

          <div className="flex items-center justify-between gap-4 rounded-md border px-3 py-3 max-w-md">
            <div className="space-y-0.5">
              <Label htmlFor="weekend-working" className="text-sm font-medium">
                Weekends are working days
              </Label>
              <p className="text-xs text-muted-foreground">
                {weekendWorking
                  ? 'Sat & Sun use the same opening hours'
                  : 'Sat & Sun are treated as fully out of hours'}
              </p>
            </div>
            <Switch
              id="weekend-working"
              checked={weekendWorking}
              onCheckedChange={setWeekendWorking}
            />
          </div>

          <Button onClick={saveOpeningHours} disabled={savingHours} className="gap-2">
            {savingHours ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Save opening hours
          </Button>
        </CardContent>
      </Card>

      {/* Engineer encouragement / standings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Crown className="h-5 w-5 text-primary" />
            Engineer Standings
          </CardTitle>
          <CardDescription>
            Shows each engineer their own productivity position and first-time-fix rating within
            their department, plus a crown on the leader&apos;s home page. Engineers never see
            anyone else&apos;s position. Turn this off to hide it for everyone.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between gap-4 rounded-md border px-3 py-3">
            <div className="space-y-0.5">
              <Label htmlFor="engagement-toggle" className="text-sm font-medium">
                Show standings on engineer dashboards
              </Label>
              <p className="text-xs text-muted-foreground">
                {engagementEnabled ? 'Currently visible to engineers' : 'Currently hidden'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {savingEngagement && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
              <Switch
                id="engagement-toggle"
                checked={engagementEnabled}
                onCheckedChange={toggleEngagement}
                disabled={savingEngagement}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* PO request overdue threshold */}
      <Card>
        <CardHeader>
          <CardTitle>PO Request Overdue Threshold</CardTitle>
          <CardDescription>
            When a PO request email has been sent and not yet authorised after this many days, it
            will be flagged as overdue in the Chargeable Calls grid.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-end gap-3 max-w-xs">
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="overdue-days">Days until overdue</Label>
              <Input
                id="overdue-days"
                type="number"
                min={1}
                max={365}
                value={overdueDays}
                onChange={(e) => setOverdueDays(e.target.value)}
                className="w-full"
              />
            </div>
            <Button
              onClick={saveOverdueDays}
              disabled={savingOverdue}
              className="gap-2"
            >
              {savingOverdue ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              Save
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Deadline failed reasons */}
      <Card>
        <CardHeader>
          <CardTitle>Deadline Failed Reasons</CardTitle>
          <CardDescription>
            Configurable reasons selectable when a call misses its respond-by deadline. These
            appear in a dropdown on the call overview for office and admin users. You can rename a
            reason inline, and flag any reason as{' '}
            <span className="font-medium">excluded from KPI</span> &mdash; misses given an excluded
            reason are excused and removed from compliance calculations.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            {reasons.map((r) => {
              const isExcluded = excluded.includes(r)
              return (
                <div
                  key={r}
                  className="flex flex-wrap items-center gap-2 rounded-md border px-3 py-2"
                >
                  <Input
                    defaultValue={r}
                    className="h-8 flex-1 min-w-[12rem]"
                    onBlur={(e) => renameReason(r, e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                        e.preventDefault()
                        ;(e.target as HTMLInputElement).blur()
                      }
                    }}
                    aria-label={`Rename "${r}"`}
                  />
                  <div className="flex items-center gap-2 rounded-md px-2 py-1">
                    <ShieldOff
                      className={`h-3.5 w-3.5 ${isExcluded ? 'text-amber-600' : 'text-muted-foreground'}`}
                    />
                    <Label
                      htmlFor={`exclude-${r}`}
                      className="cursor-pointer text-xs text-muted-foreground"
                    >
                      Exclude from KPI
                    </Label>
                    <Switch
                      id={`exclude-${r}`}
                      checked={isExcluded}
                      onCheckedChange={(next) => toggleExcluded(r, next)}
                    />
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                    onClick={() => removeReason(r)}
                    aria-label={`Remove "${r}"`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )
            })}
            {reasons.length === 0 && (
              <p className="text-sm text-muted-foreground italic">No reasons configured yet.</p>
            )}
          </div>

          <Separator />

          <div className="flex gap-2">
            <Input
              placeholder="Add a reason..."
              value={newReason}
              onChange={(e) => setNewReason(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                  e.preventDefault()
                  addReason()
                }
              }}
              className="flex-1"
            />
            <Button variant="outline" onClick={addReason} className="gap-2">
              <Plus className="h-4 w-4" />
              Add
            </Button>
          </div>

          <Button
            onClick={saveReasons}
            disabled={savingReasons}
            className="gap-2"
          >
            {savingReasons ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Save reasons
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
