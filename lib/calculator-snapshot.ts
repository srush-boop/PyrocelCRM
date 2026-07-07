/**
 * Calculator snapshots — a generic, serialisable record of the inputs and
 * headline result behind a calculator-derived quote line. Stored on
 * `quote_line_items.calculator_snapshot` (jsonb) so any price produced by the
 * installation or maintenance calculator can later be re-opened and viewed /
 * adjusted exactly as it was entered.
 *
 * Keep these shapes backwards-compatible: bump `version` and tolerate missing
 * fields when reading old snapshots rather than breaking the viewer.
 */

import type { InstallationInput, PricingMode } from '@/lib/installation-calculator'

export const CALCULATOR_SNAPSHOT_VERSION = 1

/** Full form state needed to rebuild the installation calculator dialog. */
export interface InstallationSnapshotInputs {
  input: InstallationInput
  mode: PricingMode
}

/** One sub-contracted service row, as edited in the maintenance dialog. */
export interface MaintenanceSubRowSnapshot {
  description: string
  cost: number
  marginPct: number
}

/** Full form state needed to rebuild the maintenance calculator dialog. */
export interface MaintenanceSnapshotInputs {
  fireAssets: Record<string, number>
  fireVisits: number
  weeklyFireTesting: boolean
  includeComprehensive: boolean
  centralBatteryUnits: number
  luminaires: number
  monthlyElTesting: boolean
  intruderAssets: Record<string, number>
  intruderVisits: number
  intruderPlatinum: boolean
  cctvAssets: Record<string, number>
  cctvVisits: number
  cctvBanksmanHours: number
  cctvAccessOption: string
  cctvAccessManualCost: number
  accessAssets: Record<string, number>
  accessVisits: number
  mechanicalDampers: number
  automaticDampers: number
  damperVisits: number
  damperAccessCost: number
  fireMonitoring: Record<string, number>
  intruderMonitoring: Record<string, number>
  cctvMonitoringCost: number
  subcontract: MaintenanceSubRowSnapshot[]
  directDiscount: number
  monitoringDiscount: number
}

export interface InstallationSnapshot {
  kind: 'installation'
  version: number
  inputs: InstallationSnapshotInputs
  result: { total: number; mode: PricingMode }
}

export interface MaintenanceSnapshot {
  kind: 'maintenance'
  version: number
  inputs: MaintenanceSnapshotInputs
  result: { total: number }
}

export type CalculatorSnapshot = InstallationSnapshot | MaintenanceSnapshot

/** Narrow an unknown jsonb value into a CalculatorSnapshot (defensive). */
export function parseCalculatorSnapshot(value: unknown): CalculatorSnapshot | null {
  if (!value || typeof value !== 'object') return null
  const v = value as { kind?: unknown; inputs?: unknown }
  if (v.kind === 'installation' && v.inputs && typeof v.inputs === 'object') {
    return value as InstallationSnapshot
  }
  if (v.kind === 'maintenance' && v.inputs && typeof v.inputs === 'object') {
    return value as MaintenanceSnapshot
  }
  return null
}
