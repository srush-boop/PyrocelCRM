'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatDateUK } from '@/lib/utils'
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Checkbox } from '@/components/ui/checkbox'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Plus, Trash2, Wrench, Loader2, Calendar as CalendarIcon, Edit2, Clock } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { format } from 'date-fns'
import { cn } from '@/lib/utils'
import type { ServiceType, SiteService, Profile, Task } from '@/lib/types/database'

interface SiteServicesManagerProps {
  siteId: string
  siteServices: (SiteService & { service_type: ServiceType })[]
  availableServiceTypes: ServiceType[]
  engineers?: Profile[]
  tasks?: Task[]
}

export function SiteServicesManager({
  siteId,
  siteServices,
  availableServiceTypes,
  engineers = [],
  tasks = [],
}: SiteServicesManagerProps) {
  const [selectedServiceTypes, setSelectedServiceTypes] = useState<string[]>([])
  const [addServicesOpen, setAddServicesOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editFrequencyValue, setEditFrequencyValue] = useState<number>(12)
  const [editFrequencyUnit, setEditFrequencyUnit] = useState<'weeks' | 'months'>('months')
  const [editToleranceDays, setEditToleranceDays] = useState<number>(7)
  const [adding, setAdding] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  
  // Task scheduling state
  const [scheduleServiceId, setScheduleServiceId] = useState<string | null>(null)
  const [scheduleDate, setScheduleDate] = useState<Date>(new Date())
  const [scheduleEngineerId, setScheduleEngineerId] = useState<string>('')
  const [scheduling, setScheduling] = useState(false)
  
  const router = useRouter()
  const supabase = createClient()

  const handleToggleService = (serviceTypeId: string) => {
    setSelectedServiceTypes(prev => 
      prev.includes(serviceTypeId)
        ? prev.filter(id => id !== serviceTypeId)
        : [...prev, serviceTypeId]
    )
  }

  const handleAddServices = async () => {
    if (selectedServiceTypes.length === 0) return
    setAdding(true)

    const insertData = selectedServiceTypes.map(serviceTypeId => {
      const serviceType = availableServiceTypes.find(st => st.id === serviceTypeId)
      return {
        site_id: siteId,
        service_type_id: serviceTypeId,
        frequency_value: serviceType?.default_frequency_value ?? 12,
        frequency_unit: serviceType?.default_frequency_unit ?? 'months',
      }
    })

    await supabase.from('site_services').insert(insertData)

    setAdding(false)
    setSelectedServiceTypes([])
    setAddServicesOpen(false)
    router.refresh()
  }

  const handleEditFrequency = async (serviceId: string) => {
    await supabase
      .from('site_services')
      .update({
        frequency_value: editFrequencyValue,
        frequency_unit: editFrequencyUnit,
        deadline_tolerance_days: editToleranceDays,
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

  const handleScheduleTask = async () => {
    if (!scheduleServiceId) return
    setScheduling(true)

    await supabase.from('tasks').insert({
      site_service_id: scheduleServiceId,
      assigned_engineer_id: scheduleEngineerId || null,
      scheduled_date: format(scheduleDate, 'yyyy-MM-dd'),
      status: 'pending',
    })

    setScheduling(false)
    setScheduleServiceId(null)
    setScheduleDate(new Date())
    setScheduleEngineerId('')
    router.refresh()
  }

  // Get pending tasks count for each service
  const getServiceTaskCount = (serviceId: string) => {
    return tasks.filter(t => t.site_service_id === serviceId && t.status === 'pending').length
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Wrench className="h-5 w-5" />
                Services
              </CardTitle>
              <CardDescription>
                Services scheduled for this site
              </CardDescription>
            </div>
            {availableServiceTypes.length > 0 && (
              <Button onClick={() => setAddServicesOpen(true)} size="sm">
                <Plus className="mr-2 h-4 w-4" />
                Add Services
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {siteServices.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No services configured for this site
            </p>
          ) : (
            <div className="space-y-3">
              {siteServices.map((ss) => {
                const pendingTasks = getServiceTaskCount(ss.id)
                return (
                  <div
                    key={ss.id}
                    className="flex items-center justify-between p-3 border rounded-lg"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-medium">{ss.service_type?.name}</p>
                        {pendingTasks > 0 && (
                          <Badge variant="secondary" className="text-xs">
                            {pendingTasks} pending
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-sm text-muted-foreground">
                        <span>Every {ss.frequency_value} {ss.frequency_unit}</span>
                        <span>•</span>
                        <span>Tolerance: {ss.deadline_tolerance_days} days</span>
                        {ss.last_service_date && (
                          <>
                            <span>•</span>
                            <span className="flex items-center gap-1">
                              <CalendarIcon className="h-3 w-3" />
                              Last: {formatDateUK(ss.last_service_date)}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          setScheduleServiceId(ss.id)
                          setScheduleDate(new Date())
                          setScheduleEngineerId('')
                        }}
                        className="text-primary hover:text-primary"
                        title="Schedule Task"
                      >
                        <Clock className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          setEditingId(ss.id)
                          setEditFrequencyValue(ss.frequency_value)
                          setEditFrequencyUnit(ss.frequency_unit)
                          setEditToleranceDays(ss.deadline_tolerance_days)
                        }}
                        className="text-muted-foreground hover:text-foreground"
                        title="Edit Frequency"
                      >
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setDeleteId(ss.id)}
                        className="text-destructive hover:text-destructive"
                        title="Remove Service"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {availableServiceTypes.length === 0 && siteServices.length > 0 && (
            <p className="text-xs text-muted-foreground text-center">
              All available services have been added
            </p>
          )}
        </CardContent>
      </Card>

      {/* Add Multiple Services Dialog */}
      <Dialog open={addServicesOpen} onOpenChange={setAddServicesOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Services to Site</DialogTitle>
            <DialogDescription>
              Select one or more services to add to this site
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-3 max-h-[300px] overflow-y-auto">
            {availableServiceTypes.map((st) => (
              <div
                key={st.id}
                className={cn(
                  "flex items-start gap-3 p-3 border rounded-lg cursor-pointer transition-colors",
                  selectedServiceTypes.includes(st.id) 
                    ? "border-primary bg-primary/5" 
                    : "hover:bg-muted/50"
                )}
                onClick={() => handleToggleService(st.id)}
              >
                <Checkbox
                  checked={selectedServiceTypes.includes(st.id)}
                  onCheckedChange={() => handleToggleService(st.id)}
                  className="mt-0.5"
                />
                <div className="flex-1">
                  <p className="font-medium">{st.name}</p>
                  <p className="text-sm text-muted-foreground">
                    Default: Every {st.default_frequency_value} {st.default_frequency_unit}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Tolerance: {st.default_deadline_tolerance_days} days
                  </p>
                  {st.description && (
                    <p className="text-xs text-muted-foreground mt-1">{st.description}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setAddServicesOpen(false)
              setSelectedServiceTypes([])
            }}>
              Cancel
            </Button>
            <Button 
              onClick={handleAddServices} 
              disabled={selectedServiceTypes.length === 0 || adding}
            >
              {adding ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Adding...
                </>
              ) : (
                <>
                  <Plus className="mr-2 h-4 w-4" />
                  Add {selectedServiceTypes.length > 0 ? `(${selectedServiceTypes.length})` : ''} Service{selectedServiceTypes.length !== 1 ? 's' : ''}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Schedule Task Dialog */}
      <Dialog open={!!scheduleServiceId} onOpenChange={() => setScheduleServiceId(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Schedule Service Task</DialogTitle>
            <DialogDescription>
              Schedule a task for {siteServices.find(ss => ss.id === scheduleServiceId)?.service_type?.name}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div className="grid gap-2">
              <Label>Scheduled Date *</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      'w-full justify-start text-left font-normal',
                      !scheduleDate && 'text-muted-foreground'
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {scheduleDate ? format(scheduleDate, 'PPP') : <span>Pick a date</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={scheduleDate}
                    onSelect={(date) => date && setScheduleDate(date)}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            {engineers.length > 0 && (
              <div className="grid gap-2">
                <Label>Assign Engineer</Label>
                <Select value={scheduleEngineerId} onValueChange={setScheduleEngineerId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select an engineer (optional)" />
                  </SelectTrigger>
                  <SelectContent>
                    {engineers.map((engineer) => (
                      <SelectItem key={engineer.id} value={engineer.id}>
                        {engineer.full_name || engineer.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setScheduleServiceId(null)}>
              Cancel
            </Button>
            <Button onClick={handleScheduleTask} disabled={scheduling}>
              {scheduling ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Scheduling...
                </>
              ) : (
                <>
                  <Clock className="mr-2 h-4 w-4" />
                  Schedule Task
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
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

      {/* Edit Frequency and Tolerance Dialog */}
      <AlertDialog open={!!editingId} onOpenChange={() => setEditingId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Edit Service Details</AlertDialogTitle>
            <AlertDialogDescription>
              Update frequency and deadline tolerance for this service
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
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
            <div className="grid gap-2">
              <Label htmlFor="tolerance-days">Deadline Tolerance (days)</Label>
              <Input
                id="tolerance-days"
                type="number"
                min={1}
                max={365}
                value={editToleranceDays}
                onChange={(e) => setEditToleranceDays(parseInt(e.target.value) || 7)}
              />
              <p className="text-xs text-muted-foreground">
                How many days after the due date before this service is considered overdue
              </p>
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
