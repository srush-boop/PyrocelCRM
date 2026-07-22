'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
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
import { Loader2, Plus, Pencil, Trash2, Check } from 'lucide-react'
import {
  createRateCard,
  updateRateCard,
  updateRateCardBand,
  deleteRateCard,
} from '@/lib/actions/rate-cards'
import { RATE_BANDS, RATE_BAND_LABELS, type RateBand, type RateCard } from '@/lib/billing/rate-cards'
import { NominalCodeSelect } from '@/components/dashboard/billing/nominal-code-select'
import type { NominalCode } from '@/lib/types/database'

interface RateCardsSettingsProps {
  rateCards: RateCard[]
  nominalCodes: NominalCode[]
}

interface CardFormState {
  id?: string
  name: string
  includeTravel: boolean
  minHours: string
  roundIncrement: string
  isDefault: boolean
  active: boolean
  attendanceNominalCodeId: string | null
  labourNominalCodeId: string | null
}

function emptyForm(): CardFormState {
  return {
    name: '',
    includeTravel: false,
    minHours: '1',
    roundIncrement: '0.5',
    isDefault: false,
    active: true,
    attendanceNominalCodeId: null,
    labourNominalCodeId: null,
  }
}

const poundsFromPence = (pence: number) => (pence / 100).toFixed(2)
const penceFromPounds = (pounds: string) => Math.max(0, Math.round((Number.parseFloat(pounds) || 0) * 100))

export function RateCardsSettings({ rateCards, nominalCodes }: RateCardsSettingsProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [form, setForm] = useState<CardFormState>(emptyForm())
  const [deleteTarget, setDeleteTarget] = useState<RateCard | null>(null)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  function openCreate() {
    setForm(emptyForm())
    setMessage(null)
    setDialogOpen(true)
  }

  function openEdit(card: RateCard) {
    setForm({
      id: card.id,
      name: card.name,
      includeTravel: card.include_travel_time,
      minHours: String(card.min_labour_hours),
      roundIncrement: String(card.round_increment_hours),
      isDefault: card.is_default,
      active: card.active,
      attendanceNominalCodeId: card.attendance_nominal_code_id,
      labourNominalCodeId: card.labour_nominal_code_id,
    })
    setMessage(null)
    setDialogOpen(true)
  }

  function handleSaveCard() {
    if (!form.name.trim()) {
      setMessage({ type: 'error', text: 'A name is required.' })
      return
    }
    startTransition(async () => {
      const res = form.id
        ? await updateRateCard(form.id, {
            name: form.name,
            includeTravelTime: form.includeTravel,
            minLabourHours: Number.parseFloat(form.minHours) || 0,
            roundIncrementHours: Number.parseFloat(form.roundIncrement) || 0,
            isDefault: form.isDefault,
            active: form.active,
            attendanceNominalCodeId: form.attendanceNominalCodeId,
            labourNominalCodeId: form.labourNominalCodeId,
          })
        : await createRateCard({
            name: form.name,
            includeTravelTime: form.includeTravel,
            minLabourHours: Number.parseFloat(form.minHours) || 0,
            roundIncrementHours: Number.parseFloat(form.roundIncrement) || 0,
            isDefault: form.isDefault,
          })
      if (res.error) {
        setMessage({ type: 'error', text: res.error })
        return
      }
      setDialogOpen(false)
      router.refresh()
    })
  }

  function handleDelete() {
    if (!deleteTarget) return
    const target = deleteTarget
    startTransition(async () => {
      const res = await deleteRateCard(target.id)
      setDeleteTarget(null)
      if (res.error) {
        setMessage({ type: 'error', text: res.error })
        return
      }
      router.refresh()
    })
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle>Rate cards</CardTitle>
          <CardDescription>
            Banded call-out and labour pricing applied automatically when a chargeable call is
            invoiced. Each billing account uses the default card unless it has an override.
          </CardDescription>
        </div>
        <Button onClick={openCreate} className="gap-2">
          <Plus className="h-4 w-4" />
          Add rate card
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {message && (
          <div
            className={`rounded-lg p-3 text-sm ${
              message.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'
            }`}
          >
            {message.text}
          </div>
        )}

        {rateCards.length === 0 ? (
          <p className="rounded-md border py-8 text-center text-sm text-muted-foreground">
            No rate cards yet. Add one to auto-price call-outs and labour.
          </p>
        ) : (
          rateCards.map((card) => (
            <RateCardBlock
              key={card.id}
              card={card}
              nominalCodes={nominalCodes}
              onEdit={() => openEdit(card)}
              onDelete={() => setDeleteTarget(card)}
            />
          ))
        )}
      </CardContent>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{form.id ? 'Edit rate card' : 'Add rate card'}</DialogTitle>
            <DialogDescription>
              Set how labour hours are measured. Prices for each time band are edited on the card
              itself.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-1.5">
              <Label htmlFor="rc-name">Name</Label>
              <Input
                id="rc-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Standard Rate Card"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="rc-min">Minimum labour hours</Label>
                <Input
                  id="rc-min"
                  type="number"
                  min={0}
                  step={0.5}
                  value={form.minHours}
                  onChange={(e) => setForm({ ...form, minHours: e.target.value })}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="rc-round">Round up to (hours)</Label>
                <Input
                  id="rc-round"
                  type="number"
                  min={0}
                  step={0.25}
                  value={form.roundIncrement}
                  onChange={(e) => setForm({ ...form, roundIncrement: e.target.value })}
                />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.includeTravel}
                onChange={(e) => setForm({ ...form, includeTravel: e.target.checked })}
                className="h-4 w-4 rounded border-input"
              />
              Include travel time in billable labour hours
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.isDefault}
                onChange={(e) => setForm({ ...form, isDefault: e.target.checked })}
                className="h-4 w-4 rounded border-input"
              />
              Company default rate card
            </label>
            {form.id && !form.isDefault && (
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.active}
                  onChange={(e) => setForm({ ...form, active: e.target.checked })}
                  className="h-4 w-4 rounded border-input"
                />
                Active
              </label>
            )}
            {form.id ? (
              <div className="space-y-3 rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">
                  Nominal codes for lines priced from this card (internal only). These take
                  precedence over the service type&apos;s code; leave as Auto to inherit it.
                </p>
                <div className="grid gap-1.5">
                  <Label htmlFor="rc-att-nominal">Attendance / call-out nominal code</Label>
                  <NominalCodeSelect
                    id="rc-att-nominal"
                    value={form.attendanceNominalCodeId}
                    onChange={(id) => setForm({ ...form, attendanceNominalCodeId: id })}
                    codes={nominalCodes}
                    noneLabel="Auto / inherit service type"
                    placeholder="Auto / inherit service type"
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="rc-lab-nominal">Labour nominal code</Label>
                  <NominalCodeSelect
                    id="rc-lab-nominal"
                    value={form.labourNominalCodeId}
                    onChange={(id) => setForm({ ...form, labourNominalCodeId: id })}
                    codes={nominalCodes}
                    noneLabel="Auto / inherit service type"
                    placeholder="Auto / inherit service type"
                  />
                </div>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                Save the card first, then reopen it to link nominal codes for its attendance and
                labour lines.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={isPending}>
              Cancel
            </Button>
            <Button onClick={handleSaveCard} disabled={isPending}>
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {form.id ? 'Save changes' : 'Create rate card'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleteTarget?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Billing accounts using this card as an override will fall back to the default card.
              This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                handleDelete()
              }}
              disabled={isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}

// A single rate card: meta header + editable per-band pricing grid.
function RateCardBlock({
  card,
  nominalCodes,
  onEdit,
  onDelete,
}: {
  card: RateCard
  nominalCodes: NominalCode[]
  onEdit: () => void
  onDelete: () => void
}) {
  const router = useRouter()
  const nominalLabel = (id: string) => {
    const c = nominalCodes.find((n) => n.id === id)
    return c ? c.code : '—'
  }
  const [isPending, startTransition] = useTransition()
  const [savedBand, setSavedBand] = useState<RateBand | null>(null)

  // Local draft keyed by band; pounds strings for currency inputs.
  const initial = Object.fromEntries(
    RATE_BANDS.map((band) => {
      const b = card.bands.find((x) => x.band === band)
      return [
        band,
        {
          feePounds: poundsFromPence(b?.attendance_fee_pence ?? 0),
          // Stored in hours; edited in whole minutes for finer control (e.g. 10 min).
          includedMinutes: String(Math.round((b?.attendance_included_hours ?? 0) * 60)),
          ratePounds: poundsFromPence(b?.hourly_rate_pence ?? 0),
        },
      ]
    }),
  ) as Record<RateBand, { feePounds: string; includedMinutes: string; ratePounds: string }>

  const [draft, setDraft] = useState(initial)

  function saveBand(band: RateBand) {
    const row = draft[band]
    startTransition(async () => {
      const res = await updateRateCardBand(card.id, band, {
        attendanceFeePence: penceFromPounds(row.feePounds),
        // Minutes entered in the UI, stored back as fractional hours.
        attendanceIncludedHours: (Number.parseFloat(row.includedMinutes) || 0) / 60,
        hourlyRatePence: penceFromPounds(row.ratePounds),
      })
      if (!res.error) {
        setSavedBand(band)
        setTimeout(() => setSavedBand(null), 1500)
        router.refresh()
      }
    })
  }

  return (
    <div className="rounded-lg border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="font-medium">{card.name}</span>
            {card.is_default && <Badge>Default</Badge>}
            {!card.active && <Badge variant="secondary">Inactive</Badge>}
            {card.include_travel_time && <Badge variant="outline">Bills travel</Badge>}
          </div>
          <p className="text-xs text-muted-foreground">
            Min {card.min_labour_hours}h · rounds up to {card.round_increment_hours}h
          </p>
          {(card.attendance_nominal_code_id || card.labour_nominal_code_id) && (
            <p className="text-xs text-muted-foreground">
              Nominal:{' '}
              {card.attendance_nominal_code_id
                ? `attendance ${nominalLabel(card.attendance_nominal_code_id)}`
                : 'attendance auto'}
              {' · '}
              {card.labour_nominal_code_id
                ? `labour ${nominalLabel(card.labour_nominal_code_id)}`
                : 'labour auto'}
            </p>
          )}
        </div>
        <div className="flex gap-1">
          <Button variant="ghost" size="icon" onClick={onEdit} aria-label={`Edit ${card.name}`}>
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={onDelete}
            disabled={card.is_default}
            aria-label={`Delete ${card.name}`}
          >
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      </div>

      <div className="mt-3 rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Band</TableHead>
              <TableHead>Attendance fee (£)</TableHead>
              <TableHead>Included minutes</TableHead>
              <TableHead>Hourly labour (£)</TableHead>
              <TableHead className="w-20" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {RATE_BANDS.map((band) => (
              <TableRow key={band}>
                <TableCell className="font-medium">{RATE_BAND_LABELS[band]}</TableCell>
                <TableCell>
                  <Input
                    type="number"
                    min={0}
                    step={0.01}
                    inputMode="decimal"
                    value={draft[band].feePounds}
                    onChange={(e) =>
                      setDraft({ ...draft, [band]: { ...draft[band], feePounds: e.target.value } })
                    }
                    className="h-8 w-28"
                    aria-label={`${RATE_BAND_LABELS[band]} attendance fee`}
                  />
                </TableCell>
                <TableCell>
                  <Input
                    type="number"
                    min={0}
                    step={5}
                    inputMode="numeric"
                    value={draft[band].includedMinutes}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        [band]: { ...draft[band], includedMinutes: e.target.value },
                      })
                    }
                    className="h-8 w-24"
                    aria-label={`${RATE_BAND_LABELS[band]} included minutes`}
                  />
                </TableCell>
                <TableCell>
                  <Input
                    type="number"
                    min={0}
                    step={0.01}
                    inputMode="decimal"
                    value={draft[band].ratePounds}
                    onChange={(e) =>
                      setDraft({ ...draft, [band]: { ...draft[band], ratePounds: e.target.value } })
                    }
                    className="h-8 w-28"
                    aria-label={`${RATE_BAND_LABELS[band]} hourly labour rate`}
                  />
                </TableCell>
                <TableCell>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => saveBand(band)}
                    disabled={isPending}
                  >
                    {savedBand === band ? (
                      <Check className="h-4 w-4 text-green-600" />
                    ) : (
                      'Save'
                    )}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
