'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Loader2, UserPlus } from 'lucide-react'
import type { Profile } from '@/lib/types/database'

interface AssignEngineerCardProps {
  taskId: string
  /** Currently assigned engineer id (null when unassigned). */
  assignedEngineerId: string | null
  /** Engineers available to assign. */
  engineers: Profile[]
}

/**
 * Office/admin quick-assign (or reassign) control for a call, mirroring the one
 * in the generic task flow so every call — including the per-asset flows
 * (emergency lighting, dampers, fire alarm, extinguishers) — is assignable from
 * the call detail page. Plain client-side update; the DB trigger still blocks
 * reassigning a completed call.
 */
export function AssignEngineerCard({
  taskId,
  assignedEngineerId,
  engineers,
}: AssignEngineerCardProps) {
  const router = useRouter()
  const supabase = createClient()
  const [selected, setSelected] = useState<string | null>(assignedEngineerId)
  const [assigning, setAssigning] = useState(false)

  const assignEngineer = async (value: string) => {
    const engineerId = value === 'unassigned' ? null : value
    setAssigning(true)
    await supabase
      .from('tasks')
      .update({ assigned_engineer_id: engineerId, updated_at: new Date().toISOString() })
      .eq('id', taskId)
    setSelected(engineerId)
    setAssigning(false)
    router.refresh()
  }

  return (
    <Card>
      <CardContent className="space-y-1.5 p-4 text-sm">
        <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <UserPlus className="h-3.5 w-3.5" />
          Assign engineer
        </span>
        <Select
          value={selected ?? 'unassigned'}
          onValueChange={assignEngineer}
          disabled={assigning}
        >
          <SelectTrigger>
            {assigning ? (
              <span className="flex items-center gap-1.5">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving...
              </span>
            ) : (
              <SelectValue placeholder="Assign to..." />
            )}
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="unassigned">Unassigned</SelectItem>
            {engineers.map((eng) => (
              <SelectItem key={eng.id} value={eng.id}>
                {eng.full_name || eng.email}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </CardContent>
    </Card>
  )
}
