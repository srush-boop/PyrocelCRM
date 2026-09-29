import { createClient } from '@/lib/supabase/server'

export type PartRequestQueueItem = {
  id: string
  partId: string
  partName: string
  partSku: string | null
  locationId: string
  locationName: string
  locationOwnerId: string | null
  requesterId: string
  requesterName: string
  quantity: number
  collectedQty: number
  availableAtSource: number
  message: string | null
  status: string
  resolutionNote: string | null
  createdAt: string
  resolvedAt: string | null
}

const RECENT_DAYS = 14

/**
 * Part requests visible to the signed-in user. RLS already limits engineers to
 * requests they raised or requests against a location they hold; office/admin
 * see everything. Returns open requests plus ones closed in the last 14 days.
 */
export async function getPartRequestQueue(): Promise<PartRequestQueueItem[]> {
  const supabase = await createClient()
  const since = new Date(Date.now() - RECENT_DAYS * 86_400_000).toISOString()

  const { data, error } = await supabase
    .from('part_requests')
    .select(
      'id, part_id, location_id, requested_by, quantity, collected_qty, message, status, resolution_note, created_at, resolved_at, part:parts(name, sku), location:stock_locations!part_requests_location_id_fkey(name, engineer_id), requester:profiles!part_requests_requested_by_fkey(full_name)',
    )
    .or(`status.in.(pending,approved),resolved_at.gte.${since}`)
    .order('created_at', { ascending: false })
    .limit(200)

  if (error || !data) return []

  type Row = {
    id: string
    part_id: string
    location_id: string
    requested_by: string
    quantity: number
    collected_qty: number
    message: string | null
    status: string
    resolution_note: string | null
    created_at: string
    resolved_at: string | null
    part: { name: string; sku: string | null } | null
    location: { name: string; engineer_id: string | null } | null
    requester: { full_name: string | null } | null
  }
  const rows = data as unknown as Row[]

  const open = rows.filter((r) => r.status === 'pending' || r.status === 'approved')
  const available = new Map<string, number>()
  if (open.length > 0) {
    const { data: items } = await supabase
      .from('stock_items')
      .select('location_id, part_id, quantity')
      .in('part_id', Array.from(new Set(open.map((r) => r.part_id))))
      .in('location_id', Array.from(new Set(open.map((r) => r.location_id))))
    for (const i of (items ?? []) as { location_id: string; part_id: string; quantity: number }[]) {
      available.set(`${i.location_id}:${i.part_id}`, i.quantity)
    }
  }

  return rows.map((r) => ({
    id: r.id,
    partId: r.part_id,
    partName: r.part?.name ?? 'Unknown part',
    partSku: r.part?.sku ?? null,
    locationId: r.location_id,
    locationName: r.location?.name ?? 'Unknown location',
    locationOwnerId: r.location?.engineer_id ?? null,
    requesterId: r.requested_by,
    requesterName: r.requester?.full_name ?? 'Unknown',
    quantity: r.quantity,
    collectedQty: r.collected_qty ?? 0,
    availableAtSource: available.get(`${r.location_id}:${r.part_id}`) ?? 0,
    message: r.message,
    status: r.status,
    resolutionNote: r.resolution_note,
    createdAt: r.created_at,
    resolvedAt: r.resolved_at,
  }))
}
