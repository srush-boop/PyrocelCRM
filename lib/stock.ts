import { createClient } from '@/lib/supabase/server'
import type {
  LowStockAlert,
  Part,
  StockItem,
  StockLocation,
  StockLocationKind,
  StockLocationSummary,
  StockMovement,
} from '@/lib/types/database'

// Re-exported for server-side callers; defined in client-safe lib/utils.
export { formatGBP } from '@/lib/utils'

// All locations, rolled up with held £ value, item/quantity counts and the
// number of stock profiles at or below their minimum level. Visible to all
// staff per the access rules.
export async function getStockLocationSummaries(
  branchId?: string | null,
): Promise<StockLocationSummary[]> {
  const supabase = await createClient()

  let locationsQuery = supabase
    .from('stock_locations')
    .select(
      '*, engineer:profiles!stock_locations_engineer_id_fkey(id, full_name, email, branch_id), branch:branches(*)',
    )
    .order('kind')
    .order('name')

  const [{ data: locations }, { data: items }] = await Promise.all([
    locationsQuery,
    supabase.from('stock_items').select('*, part:parts(unit_cost)'),
  ])

  let locs = (locations || []) as StockLocation[]

  // A location's effective branch is its own branch_id, falling back to the
  // assigned engineer's branch for van locations.
  if (branchId) {
    locs = locs.filter((loc) => {
      const effective = loc.branch_id ?? loc.engineer?.branch_id ?? null
      return effective === branchId
    })
  }
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

// Every stock profile at or below its minimum re-order level (min_level > 0).
// Drives the low-stock dashboard. Pass `locationIds` to scope the alerts to a
// specific set of locations (e.g. an engineer's own van); an empty array
// returns no alerts, while `undefined` returns alerts across every location.
export async function getLowStockAlerts(
  locationIds?: string[],
): Promise<LowStockAlert[]> {
  if (Array.isArray(locationIds) && locationIds.length === 0) return []

  const supabase = await createClient()

  let query = supabase
    .from('stock_items')
    .select(
      'id, location_id, part_id, quantity, min_level, location:stock_locations(name), part:parts(name, sku, unit)',
    )
    .gt('min_level', 0)
    .order('quantity')

  if (Array.isArray(locationIds)) {
    query = query.in('location_id', locationIds)
  }

  const { data } = await query

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
      .select(
        '*, engineer:profiles!stock_locations_engineer_id_fkey(id, full_name, email, branch_id), branch:branches(*)',
      )
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
  const { data } = await supabase
  .from('parts')
  .select('*, supplier:suppliers!parts_supplier_id_fkey(id, name)')
  .order('name')
  return (data || []) as Part[]
  }

  // Product suppliers only — used to link parts to the supplier they're ordered from.
  export async function getProductSuppliers(): Promise<{ id: string; name: string }[]> {
  const supabase = await createClient()
  const { data } = await supabase
  .from('suppliers')
  .select('id, name')
  .eq('supplier_type', 'product')
  .eq('status', 'active')
  .order('name')
  return (data || []) as { id: string; name: string }[]
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

// The location ids a given engineer "owns" (e.g. their assigned van). Used to
// scope low-stock alerts so engineers only see their own locations.
export async function getEngineerLocationIds(engineerId: string): Promise<string[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('stock_locations')
    .select('id')
    .eq('engineer_id', engineerId)
  return (data || []).map((l) => (l as { id: string }).id)
}

// A part matched by a free-text search, together with every location that
// currently holds it (quantity > 0). Lets engineers find where a part lives.
export interface PartLocationResult {
  part_id: string
  part_name: string
  sku: string | null
  unit: string
  totalQuantity: number
  locations: {
    location_id: string
    location_name: string
    kind: StockLocationKind
    quantity: number
  }[]
}

export async function searchPartLocations(query: string): Promise<PartLocationResult[]> {
  const q = query.trim()
  if (q.length < 2) return []

  const supabase = await createClient()

  // Escape characters that have meaning inside a PostgREST `ilike` pattern.
  const safe = q.replace(/[%_,]/g, (m) => `\\${m}`)

  const { data: parts } = await supabase
    .from('parts')
    .select('id, name, sku, unit')
    .or(`name.ilike.%${safe}%,sku.ilike.%${safe}%`)
    .order('name')
    .limit(25)

  const partList = (parts || []) as {
    id: string
    name: string
    sku: string | null
    unit: string
  }[]
  if (partList.length === 0) return []

  const partIds = partList.map((p) => p.id)
  const { data: items } = await supabase
    .from('stock_items')
    .select('part_id, quantity, location:stock_locations(id, name, kind)')
    .in('part_id', partIds)
    .gt('quantity', 0)

  type ItemRow = {
    part_id: string
    quantity: number
    location: { id: string; name: string; kind: StockLocationKind } | null
  }
  const itemRows = (items || []) as unknown as ItemRow[]

  return partList.map((p) => {
    const locations = itemRows
      .filter((i) => i.part_id === p.id && i.location)
      .map((i) => ({
        location_id: i.location!.id,
        location_name: i.location!.name,
        kind: i.location!.kind,
        quantity: i.quantity,
      }))
      .sort((a, b) => b.quantity - a.quantity)

    return {
      part_id: p.id,
      part_name: p.name,
      sku: p.sku,
      unit: p.unit,
      totalQuantity: locations.reduce((sum, l) => sum + l.quantity, 0),
      locations,
    }
  })
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
