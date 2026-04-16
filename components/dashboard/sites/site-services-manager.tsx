'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Plus, Trash2, Wrench, Loader2, Calendar, Edit2 } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface SiteServicesManagerProps {
  siteId: string
  siteServices: (SiteService & { service_type: ServiceType })[]
  availableServiceTypes: ServiceType[]
}

export function SiteServicesManager({
  siteId,
  siteServices,
  availableServiceTypes,
}: SiteServicesManagerProps) {
  const [selectedServiceType, setSelectedServiceType] = useState<string>('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editFrequencyValue, setEditFrequencyValue] = useState<number>(12)
  const [editFrequencyUnit, setEditFrequencyUnit] = useState<'weeks' | 'months'>('months')
  const [adding, setAdding] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const router = useRouter()
  const supabase = createClient()

  const handleAddService = async () => {
    if (!selectedServiceType) return
    setAdding(true)

    const serviceType = availableServiceTypes.find((st) => st.id === selectedServiceType)

    await supabase.from('site_services').insert({
      site_id: siteId,
      service_type_id: selectedServiceType,
      frequency_value: serviceType?.default_frequency_value || 12,
      frequency_unit: serviceType?.default_frequency_unit || 'months',
    })

    setAdding(false)
    setSelectedServiceType('')
    router.refresh()
  }

  const handleEditFrequency = async (serviceId: string) => {
    await supabase
      .from('site_services')
      .update({
        frequency_value: editFrequencyValue,
        frequency_unit: editFrequencyUnit,
      })
      .eq('id', serviceId)

    setEditingId(null)
    router.refresh()
  }

  const handleDeleteService = async () => {
    if (!deleteId) return

    await supabase.from('site_services').delete().eq('id', deleteId)
    setDeleteId(null)
    router.refresh()
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wrench className="h-5 w-5" />
            Services
          </CardTitle>
          <CardDescription>
            Services scheduled for this site
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {siteServices.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No services configured for this site
            </p>
          ) : (
            <div className="space-y-3">
              {siteServices.map((ss) => (
                <div
                  key={ss.id}
                  className="flex items-center justify-between p-3 border rounded-lg"
                >
                  <div>
                    <p className="font-medium">{ss.service_type?.name}</p>
                    <div className="flex items-center gap-3 text-sm text-muted-foreground">
                      <span>Every {ss.frequency_value} {ss.frequency_unit}</span>
                      {ss.last_service_date && (
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          Last: {new Date(ss.last_service_date).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        setEditingId(ss.id)
                        setEditFrequencyValue(ss.frequency_value)
                        setEditFrequencyUnit(ss.frequency_unit)
                      }}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <Edit2 className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setDeleteId(ss.id)}
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {availableServiceTypes.length > 0 && (
            <div className="flex gap-2 pt-2 border-t">
              <Select value={selectedServiceType} onValueChange={setSelectedServiceType}>
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="Add a service..." />
                </SelectTrigger>
                <SelectContent>
                  {availableServiceTypes.map((st) => (
                    <SelectItem key={st.id} value={st.id}>
                      {st.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button onClick={handleAddService} disabled={!selectedServiceType || adding}>
                {adding ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
              </Button>
            </div>
          )}

          {availableServiceTypes.length === 0 && siteServices.length > 0 && (
            <p className="text-xs text-muted-foreground text-center">
              All available services have been added
            </p>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Service</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove this service from the site? This will also
              remove any associated pending tasks.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteService}
              className="bg-destructive text-destructive-foreground"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!editingId} onOpenChange={() => setEditingId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Edit Service Frequency</AlertDialogTitle>
            <AlertDialogDescription>
              Update how often this service should be performed
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="grid grid-cols-2 gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="freq-value">Frequency Value</Label>
              <Input
                id="freq-value"
                type="number"
                min={1}
                max={60}
                value={editFrequencyValue}
                onChange={(e) => setEditFrequencyValue(parseInt(e.target.value) || 1)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="freq-unit">Unit</Label>
              <Select value={editFrequencyUnit} onValueChange={(value) =>
                setEditFrequencyUnit(value as 'weeks' | 'months')
              }>
                <SelectTrigger id="freq-unit">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="weeks">Weeks</SelectItem>
                  <SelectItem value="months">Months</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => editingId && handleEditFrequency(editingId)}
            >
              Save Changes
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
