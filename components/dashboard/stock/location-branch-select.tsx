'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Loader2, Building2 } from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { Branch } from '@/lib/types/database'

interface LocationBranchSelectProps {
  locationId: string
  branchId: string | null
  branches: Branch[]
}

/**
 * Inline branch assignment for a stock location. Managers only — lets them set
 * which branch a warehouse/van belongs to so stock can be filtered by branch.
 */
export function LocationBranchSelect({
  locationId,
  branchId,
  branches,
}: LocationBranchSelectProps) {
  const [saving, setSaving] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  if (branches.length === 0) return null

  const handleChange = async (value: string) => {
    setSaving(true)
    const next = value === 'none' ? null : value
    await supabase.from('stock_locations').update({ branch_id: next }).eq('id', locationId)
    setSaving(false)
    router.refresh()
  }

  return (
    <div className="flex items-center gap-2">
      <Building2 className="h-4 w-4 text-muted-foreground" />
      <Select
        value={branchId ?? 'none'}
        onValueChange={handleChange}
        disabled={saving}
      >
        <SelectTrigger className="w-[180px]">
          <SelectValue placeholder="No branch" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">No branch</SelectItem>
          {branches.map((branch) => (
            <SelectItem key={branch.id} value={branch.id}>
              {branch.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {saving && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
    </div>
  )
}
