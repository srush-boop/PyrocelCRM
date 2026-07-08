'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Truck, Loader2, Plus } from 'lucide-react'
import type { Profile } from '@/lib/types/database'
import {
  getEngineerVehicles,
  upsertEngineerVehicle,
  setEngineerVehicleActive,
  type EngineerVehicle,
} from '@/app/(dashboard)/dashboard/engineers/vehicle-actions'

interface VehicleDialogProps {
  user: Profile | null
  onOpenChange: (open: boolean) => void
}

/**
 * Admin dialog to manage a user's vehicle stock location(s). Creating one links
 * a `stock_locations` row to the user via `engineer_id`, which lets parts used
 * on that user's calls auto-deduct from the vehicle.
 */
export function VehicleDialog({ user, onOpenChange }: VehicleDialogProps) {
  const router = useRouter()
  const [vehicles, setVehicles] = useState<EngineerVehicle[]>([])
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, startSave] = useTransition()

  useEffect(() => {
    if (!user) return
    setLoading(true)
    setError(null)
    getEngineerVehicles(user.id).then((data) => {
      setVehicles(data)
      // Default the new-vehicle name to "<first name>'s Vehicle".
      const first = (user.full_name || '').trim().split(/\s+/)[0]
      setName(data.length === 0 && first ? `${first}'s Vehicle` : '')
      setLoading(false)
    })
  }, [user])

  const refresh = async () => {
    if (!user) return
    setVehicles(await getEngineerVehicles(user.id))
    router.refresh()
  }

  const handleCreate = () => {
    if (!user) return
    startSave(async () => {
      const res = await upsertEngineerVehicle({
        userId: user.id,
        name,
        branchId: user.branch_id ?? null,
      })
      if (res.error) {
        setError(res.error)
        return
      }
      setError(null)
      setName('')
      await refresh()
    })
  }

  const toggleActive = (v: EngineerVehicle) => {
    startSave(async () => {
      await setEngineerVehicleActive(v.id, !v.is_active)
      await refresh()
    })
  }

  return (
    <Dialog open={!!user} onOpenChange={(open) => !open && !saving && onOpenChange(false)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Truck className="h-5 w-5 text-muted-foreground" />
            Vehicle / stock location
          </DialogTitle>
          <DialogDescription>
            Manage the vehicle stock held by{' '}
            <strong>{user?.full_name || user?.email}</strong>. Parts used on their calls are
            deducted from an active vehicle automatically.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {loading ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading vehicles...
            </p>
          ) : (
            <>
              {vehicles.length > 0 ? (
                <ul className="flex flex-col gap-2">
                  {vehicles.map((v) => (
                    <li
                      key={v.id}
                      className="flex items-center justify-between gap-3 rounded-md border bg-muted/30 px-3 py-2"
                    >
                      <div className="flex items-center gap-2">
                        <Truck className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm font-medium">{v.name}</span>
                        {!v.is_active && (
                          <Badge variant="outline" className="text-muted-foreground">
                            Inactive
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">
                          {v.is_active ? 'Active' : 'Inactive'}
                        </span>
                        <Switch
                          checked={v.is_active}
                          onCheckedChange={() => toggleActive(v)}
                          disabled={saving}
                          aria-label={`Toggle ${v.name} active`}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No vehicle stock location yet. Create one below so parts used on this
                  user&apos;s calls are deducted from their vehicle.
                </p>
              )}

              <div className="space-y-1.5 border-t pt-4">
                <Label htmlFor="vehicle-name">New vehicle name</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="vehicle-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Dave's Vehicle"
                  />
                  <Button onClick={handleCreate} disabled={saving || !name.trim()} className="gap-2">
                    {saving ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Plus className="h-4 w-4" />
                    )}
                    Add
                  </Button>
                </div>
                {error && <p className="text-sm text-destructive">{error}</p>}
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
