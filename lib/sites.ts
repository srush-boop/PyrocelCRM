import type { RemoteMonitoringType } from '@/lib/types/database'

export const REMOTE_MONITORING_LABELS: Record<RemoteMonitoringType, string> = {
  fire: 'Fire',
  fire_and_fault: 'Fire and Fault',
  fault: 'Fault only',
}
