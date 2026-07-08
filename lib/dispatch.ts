import 'server-only'
import { notifyUsers } from '@/lib/notifications'

/** Format a KPI deadline as a short local time, e.g. "14:30". */
export function formatRespondBy(respondBy: string | null | undefined): string | null {
  if (!respondBy) return null
  const d = new Date(respondBy)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleString('en-GB', {
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/**
 * Compute a KPI response deadline (ISO string) from "now" + a number of hours.
 * Returns null when hours is not a positive number.
 */
export function computeRespondBy(hours: number | null | undefined): string | null {
  if (!hours || hours <= 0) return null
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString()
}

interface EmergencyNotifyInput {
  taskId: string
  engineerId: string
  siteName: string | null
  callTypeName?: string | null
  respondBy: string | null
  actorId?: string | null
}

/**
 * Send the assigned engineer a clear, prominent notification that an emergency
 * call has been assigned to them (in-app + best-effort web push). Shared by the
 * "Book Call" flow and the map dispatch "Assign" action.
 */
export async function notifyEmergencyAssignment(input: EmergencyNotifyInput): Promise<void> {
  const site = input.siteName || 'a site'
  const by = formatRespondBy(input.respondBy)
  const label = input.callTypeName ? `${input.callTypeName} — ` : ''
  const body = `${label}${site}${by ? ` · attend by ${by}` : ''}`

  await notifyUsers({
    userIds: [input.engineerId],
    title: 'Emergency call assigned',
    body,
    url: `/dashboard/tasks/${input.taskId}?from=/dashboard/schedule/map`,
    category: 'emergency_call',
    data: { taskId: input.taskId, respondBy: input.respondBy ?? null, emergency: true },
    createdBy: input.actorId ?? null,
  })
}
