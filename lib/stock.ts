import { createClient } from '@/lib/supabase/server'
import type {
  LowStockAlert,
  Part,
  StockItem,
  StockLocation,
  StockLocationSummary,
  StockMovement,
} from '@/lib/types/database'

// Re-exported for server-side callers; defined in client-safe lib/utils.
export { formatGBP } from '@/lib/utils'

// All locations, rolled up with held £ value, item/quantity counts and the
// number of stock profiles at or below their minimum level. Visible to all
// staff per the access rules.
export async function getStockLocationSummaries(): Promise<StockLocationSummary[]> {
  const supabase = await createClient()

  const [{ data: locations }, { data: items }] = await Promise.all([
    supabase
      .from('stock_locations')
      .select('*, engineer:profiles!stock_locations_engineer_id_fkey(id, full_name, email)')
      .order('kind')
      .order('name'),
    supabase.from('stock_items').select('*, part:parts(unit_cost)'),
  ])

  const locs = (locations || []) as StockLocation[]
  const stockItems = (items || []) as (StockItem & { part?: { unit_cost: number } })[]

  return locs.map((loc) => {
    const locItems = stockItems.filter((i) => i.location_id === loc.id)
    const heldValue = locItems.reduce(
      (sum, i) => sum + i.quantity * (i.part?.unit_cost ?? 0),
      0,
    )
    const totalQuantity = locItems.reduce((sum, i) => sum + i.quantity, 0)
    const lowStockCount = locItems.filter(
      (i) => i.min_level > 0 && i.quantity <= i.min_level,
    ).length

    return {
      ...loc,
      itemCount: locItems.length,
      totalQuantity,
      heldValue,
      lowStockCount,
    }
  })
}

// Every stock profile across all locations that is at or below its minimum
// re-order level (min_level > 0). Drives the low-stock dashboard.
export async function getLowStockAlerts(): Promise<LowStockAlert[]> {
  const supabase = await createClient()

  const { data } = await supabase
    .from('stock_items')
    .select(
      'id, location_id, part_id, quantity, min_level, location:stock_locations(name), part:parts(name, sku, unit)',
    )
    .gt('min_level', 0)
    .order('quantity')

  type Row = {
    id: string
    location_id: string
    part_id: string
    quantity: number
    min_level: number
    location: { name: string } | null
    part: { name: string; sku: string | null; unit: string } | null
  }

  return ((data || []) as unknown as Row[])
    .filter((r) => r.quantity <= r.min_level)
    .map((r) => ({
      stock_item_id: r.id,
      location_id: r.location_id,
      location_name: r.location?.name ?? 'Unknown',
      part_id: r.part_id,
      part_name: r.part?.name ?? 'Unknown part',
      sku: r.part?.sku ?? null,
      unit: r.part?.unit ?? 'each',
      quantity: r.quantity,
      min_level: r.min_level,
    }))
}

// A single location plus its stock profiles (with part details).
export async function getLocationWithItems(locationId: string): Promise<{
  location: StockLocation | null
  items: StockItem[]
}> {
  const supabase = await createClient()

  const [{ data: location }, { data: items }] = await Promise.all([
    supabase
      .from('stock_locations')
      .select('*, engineer:profiles!stock_locations_engineer_id_fkey(id, full_name, email)')
      .eq('id', locationId)
      .single(),
    supabase
      .from('stock_items')
      .select('*, part:parts(*)')
      .eq('location_id', locationId)
      .order('part_id'),
  ])

  return {
    location: (location as StockLocation) ?? null,
    items: (items || []) as StockItem[],
  }
}

export async function getParts(): Promise<Part[]> {
  const supabase = await createClient()
  const { data } = await supabase.from('parts').select('*').order('name')
  return (data || []) as Part[]
}

export async function getStockLocations(): Promise<StockLocation[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('stock_locations')
    .select('*, engineer:profiles!stock_locations_engineer_id_fkey(id, full_name, email)')
    .eq('is_active', true)
    .order('kind')
    .order('name')
  return (data || []) as StockLocation[]
}

// A selectable job/task that stock can be booked against. Combines the task's
// site, scheduled date and (if generated) its report reference number.
export interface JobOption {
  taskId: string
  label: string
  reference: string | null
  siteName: string
  scheduledDate: string | null
}

export async function getJobOptions(limit = 200): Promise<JobOption[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('tasks')
    .select(
      `id, scheduled_date, status,
       site_services(sites(name), service_types(name)),
       task_results(reference_number)`,
    )
    .order('scheduled_date', { ascending: false })
    .limit(limit)

  type Row = {
    id: string
    scheduled_date: string | null
    status: string | null
    site_services: {
      sites: { name: string } | null
      service_types: { name: string } | null
    } | null
    task_results: { reference_number: string | null }[] | null
  }

  return ((data || []) as unknown as Row[]).map((t) => {
    const siteName = t.site_services?.sites?.name ?? 'Unknown site'
    const serviceName = t.site_services?.service_types?.name ?? ''
    const reference = t.task_results?.[0]?.reference_number ?? null
    const datePart = t.scheduled_date
      ? new Date(t.scheduled_date).toLocaleDateString('en-GB')
      : ''
    const refPart = reference ? `${reference} · ` : ''
    const label = `${refPart}${siteName}${serviceName ? ` — ${serviceName}` : ''}${
      datePart ? ` (${datePart})` : ''
    }`
    return {
      taskId: t.id,
      label,
      reference,
      siteName,
      scheduledDate: t.scheduled_date,
    }
  })
}

// Recent stock movements with related part / location / user / task details.
export async function getStockMovements(limit = 200): Promise<StockMovement[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('stock_movements')
    .select(
      `*,
       part:parts(id, name, sku, unit, unit_cost),
       from_location:stock_locations!stock_movements_from_location_id_fkey(id, name, kind),
       to_location:stock_locations!stock_movements_to_location_id_fkey(id, name, kind),
       created_by_profile:profiles!stock_movements_created_by_fkey(id, full_name, email),
       task:tasks(id, site_service:site_services(site:sites(name)))`,
    )
    .order('created_at', { ascending: false })
    .limit(limit)
  return (data || []) as StockMovement[]
}
