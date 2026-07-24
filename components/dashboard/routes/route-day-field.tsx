'use client'

import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { AlertTriangle } from 'lucide-react'

// Weekday options in working-week order, values matching JS Date.getDay()
// (0 = Sunday … 6 = Saturday).
export const ROUTE_DAY_OPTIONS = [
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' },
  { value: 0, label: 'Sunday' },
] as const

interface RouteDayFieldProps {
  /** Selected weekday (0-6), or null when nothing chosen yet. */
  value: number | null
  onChange: (day: number) => void
  /** Monday override — must be true before a Monday route can be saved. */
  mondayAck: boolean
  onMondayAckChange: (ack: boolean) => void
}

/**
 * Shared weekday picker for routes. Choosing a day is a required part of
 * creating a route (it drives the recurring calendar band and the CDO's
 * default route for today). Monday triggers a bank-holiday warning that must
 * be acknowledged before the route can be saved.
 */
export function RouteDayField({
  value,
  onChange,
  mondayAck,
  onMondayAckChange,
}: RouteDayFieldProps) {
  const isMonday = value === 1

  return (
    <div className="grid gap-2">
      <Label htmlFor="route-day">Day of week *</Label>
      <Select
        value={value === null ? '' : String(value)}
        onValueChange={(v) => onChange(Number(v))}
      >
        <SelectTrigger id="route-day">
          <SelectValue placeholder="Select the day this route is worked" />
        </SelectTrigger>
        <SelectContent>
          {ROUTE_DAY_OPTIONS.map((day) => (
            <SelectItem key={day.value} value={String(day.value)}>
              {day.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-xs text-muted-foreground">
        Routes recur weekly on this day and drive each CDO&apos;s default route for the day.
      </p>

      {isMonday && (
        <div className="mt-1 rounded-md border border-amber-500/50 bg-amber-500/10 p-3">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <div className="space-y-2">
              <p className="text-sm text-amber-800 dark:text-amber-300">
                Monday routes often clash with bank holidays, when many sites are
                closed and calls can&apos;t be completed. Consider another day
                unless this route is specifically needed on Mondays.
              </p>
              <label className="flex items-center gap-2 text-sm font-medium text-amber-900 dark:text-amber-200">
                <Checkbox
                  checked={mondayAck}
                  onCheckedChange={(checked) => onMondayAckChange(checked === true)}
                />
                Use Monday anyway
              </label>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
