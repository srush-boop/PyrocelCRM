'use client'

import { useState, useTransition } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Copy, RefreshCw, ExternalLink, Check } from 'lucide-react'
import { toast } from 'sonner'
import { updateOncallRates, regenerateExternalToken } from '@/lib/oncall/actions'
import { BAND_META, type OncallRates } from '@/lib/oncall/types'

interface OncallSettingsProps {
  rates: OncallRates
  externalToken: string | null
}

export function OncallSettings({ rates, externalToken }: OncallSettingsProps) {
  const [pending, startTransition] = useTransition()
  const [tokenPending, startTokenTransition] = useTransition()
  const [weekdayEvening, setWeekdayEvening] = useState(rates.weekdayEvening?.toString() ?? '')
  const [weekend, setWeekend] = useState(rates.weekend?.toString() ?? '')
  const [bankHoliday, setBankHoliday] = useState(rates.bankHoliday?.toString() ?? '')
  const [token, setToken] = useState(externalToken)
  const [copied, setCopied] = useState(false)

  // The public URL is only meaningful in the browser; build it lazily.
  const externalUrl =
    token && typeof window !== 'undefined' ? `${window.location.origin}/r/oncall/${token}` : null

  const parseRate = (v: string): number | null => {
    const trimmed = v.trim()
    if (!trimmed) return null
    const n = Number(trimmed)
    return Number.isFinite(n) && n >= 0 ? n : null
  }

  const saveRates = () => {
    startTransition(async () => {
      const res = await updateOncallRates({
        weekdayEvening: parseRate(weekdayEvening),
        weekend: parseRate(weekend),
        bankHoliday: parseRate(bankHoliday),
      })
      if (res.ok) toast.success('Pay rates saved')
      else toast.error(res.error || 'Failed to save rates')
    })
  }

  const rotateToken = () => {
    startTokenTransition(async () => {
      const res = await regenerateExternalToken()
      if (res.ok && res.token) {
        setToken(res.token)
        toast.success(externalToken ? 'New link generated — the old one no longer works' : 'External link generated')
      } else {
        toast.error(res.error || 'Failed to generate link')
      }
    })
  }

  const copyUrl = async () => {
    if (!externalUrl) return
    await navigator.clipboard.writeText(externalUrl)
    setCopied(true)
    toast.success('Link copied')
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {/* Pay rates */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Standby pay rates</CardTitle>
          <CardDescription>
            Flat standby payment per on-call shift, by band. Used to estimate on-call pay in the
            summary. Leave blank if a band is not paid a standby rate.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="rate-weekday">{BAND_META.weekday_evening.label}</Label>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">£</span>
              <Input
                id="rate-weekday"
                inputMode="decimal"
                placeholder="0.00"
                value={weekdayEvening}
                onChange={(e) => setWeekdayEvening(e.target.value)}
              />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="rate-weekend">{BAND_META.weekend.label}</Label>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">£</span>
              <Input
                id="rate-weekend"
                inputMode="decimal"
                placeholder="0.00"
                value={weekend}
                onChange={(e) => setWeekend(e.target.value)}
              />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="rate-bankhol">{BAND_META.bank_holiday.label}</Label>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">£</span>
              <Input
                id="rate-bankhol"
                inputMode="decimal"
                placeholder="0.00"
                value={bankHoliday}
                onChange={(e) => setBankHoliday(e.target.value)}
              />
            </div>
          </div>
          <Button onClick={saveRates} disabled={pending}>
            {pending ? 'Saving…' : 'Save rates'}
          </Button>
        </CardContent>
      </Card>

      {/* External call-handler link */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">External call-handler link</CardTitle>
          <CardDescription>
            A private link the out-of-hours answering service uses to see who is on call and their
            contact number. Anyone with the link can view it, so share it carefully.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {token ? (
            <>
              <div className="grid gap-2">
                <Label>Shareable link</Label>
                <div className="flex items-center gap-2">
                  <Input readOnly value={externalUrl ?? 'Generating…'} className="font-mono text-xs" />
                  <Button type="button" variant="outline" size="icon" onClick={copyUrl} title="Copy link">
                    {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    <span className="sr-only">Copy link</span>
                  </Button>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {externalUrl && (
                  <Button asChild variant="outline" size="sm">
                    <a href={externalUrl} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="mr-2 h-4 w-4" />
                      Open link
                    </a>
                  </Button>
                )}
                <Button variant="outline" size="sm" onClick={rotateToken} disabled={tokenPending}>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  {tokenPending ? 'Working…' : 'Regenerate'}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Regenerating immediately revokes the current link.
              </p>
            </>
          ) : (
            <Button onClick={rotateToken} disabled={tokenPending}>
              <RefreshCw className="mr-2 h-4 w-4" />
              {tokenPending ? 'Generating…' : 'Generate link'}
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
