'use client'

import { useCallback, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Loader2, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { PostcodeLookup } from '@/components/dashboard/shared/postcode-lookup'
import { SiteClassificationFields } from '@/components/dashboard/sites/site-classification-fields'
import type { Site, Route, Client, Branch, PropertyType } from '@/lib/types/database'

interface EditSiteDialogProps {
  site: Site & { route: Route | null; client?: Client | null }
  clients: Client[]
  branches?: Branch[]
  propertyTypes?: PropertyType[]
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function EditSiteDialog({
  site,
  clients,
  branches = [],
  propertyTypes = [],
  open,
  onOpenChange,
}: EditSiteDialogProps) {
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    name: site.name,
    address: site.address,
    postcode: site.postcode || '',
    contact_name: site.contact_name || '',
    contact_email: site.contact_email || '',
    contact_phone: site.contact_phone || '',
    client_id: site.client_id || '',
    branch_id: site.branch_id || '',
    property_type_id: site.property_type_id || '',
    uprn: site.uprn || '',
    status: site.status || 'live',
    notes: site.notes || '',
    has_remote_monitoring: site.has_remote_monitoring ?? false,
    remote_monitoring_type: (site.remote_monitoring_type || '') as
      | ''
      | 'fire'
      | 'fire_and_fault'
      | 'fault',
    monitoring_station_name: site.monitoring_station_name || '',
    monitoring_station_phone: site.monitoring_station_phone || '',
    monitoring_station_url: site.monitoring_station_url || '',
  })
  const [reportingEmails, setReportingEmails] = useState<string[]>(site.reporting_emails || [])
  const [newReportingEmail, setNewReportingEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()
  const supabase = createClient()

  const handleAddReportingEmail = () => {
    if (newReportingEmail && !reportingEmails.includes(newReportingEmail)) {
      setReportingEmails([...reportingEmails, newReportingEmail])
      setNewReportingEmail('')
    }
  }

  const handleRemoveReportingEmail = (email: string) => {
    setReportingEmails(reportingEmails.filter((e) => e !== email))
  }

  // Fill the postcode and, when the address doesn't already mention the locality,
  // append it so only the street line needs editing.
  // Stable identity so the memoized PostcodeLookup doesn't re-render each keystroke.
  const applyPostcode = useCallback((r: { postcode: string; locality: string }) => {
    setFormData((prev) => {
      const current = prev.address ?? ''
      const hasLocality =
        r.locality && current.toLowerCase().includes(r.locality.toLowerCase())
      const address =
        r.locality && !hasLocality
          ? [current.trim(), r.locality].filter(Boolean).join('\n')
          : current
      return { ...prev, postcode: r.postcode, address }
    })
  }, [])

  // Stable handlers so the memoized SiteClassificationFields (with its Radix
  // Selects) only re-renders when a selected value changes, not on every keystroke.
  const handleClientChange = useCallback((value: string) => {
    setFormData((prev) => ({ ...prev, client_id: value }))
    setError(null)
  }, [])
  const handleBranchChange = useCallback((value: string) => {
    setFormData((prev) => ({ ...prev, branch_id: value }))
  }, [])
  const handlePropertyTypeChange = useCallback((value: string) => {
    setFormData((prev) => ({ ...prev, property_type_id: value }))
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (formData.status === 'live' && !formData.client_id) {
      setError('A client is required for a site when its status is Live.')
      return
    }

    setLoading(true)

    const { error: updateError } = await supabase
      .from('sites')
      .update({
        ...formData,
        client_id: formData.client_id || null,
        branch_id: formData.branch_id || null,
        property_type_id: formData.property_type_id || null,
        remote_monitoring_type: formData.has_remote_monitoring
          ? formData.remote_monitoring_type || null
          : null,
        monitoring_station_name: formData.has_remote_monitoring
          ? formData.monitoring_station_name.trim() || null
          : null,
        monitoring_station_phone: formData.has_remote_monitoring
          ? formData.monitoring_station_phone.trim() || null
          : null,
        monitoring_station_url: formData.has_remote_monitoring
          ? formData.monitoring_station_url.trim() || null
          : null,
        reporting_emails: reportingEmails,
        updated_at: new Date().toISOString(),
      })
      .eq('id', site.id)

    setLoading(false)

    if (!updateError) {
      setError(null)
      onOpenChange(false)
      router.refresh()
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Edit Site</DialogTitle>
            <DialogDescription>
              Update site information
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="name">Site Name *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
              />
            </div>
            <PostcodeLookup
              id="edit-site-postcode-lookup"
              initialValue={formData.postcode}
              onResolved={applyPostcode}
            />
            <div className="grid gap-2">
              <Label htmlFor="address">Address *</Label>
              <Textarea
                id="address"
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="postcode">Postcode</Label>
              <Input
                id="postcode"
                value={formData.postcode}
                onChange={(e) => setFormData({ ...formData, postcode: e.target.value })}
                placeholder="e.g., AB12 3CD"
              />
              <p className="text-xs text-muted-foreground">
                Used as the access code for the site&apos;s QR fire safety log book.
              </p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="uprn">UPRN</Label>
              <Input
                id="uprn"
                value={formData.uprn}
                onChange={(e) => setFormData({ ...formData, uprn: e.target.value })}
                placeholder="Unique Property Reference Number"
                inputMode="numeric"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="contact_name">Contact Name</Label>
                <Input
                  id="contact_name"
                  value={formData.contact_name}
                  onChange={(e) => setFormData({ ...formData, contact_name: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="contact_phone">Contact Phone</Label>
                <Input
                  id="contact_phone"
                  value={formData.contact_phone}
                  onChange={(e) => setFormData({ ...formData, contact_phone: e.target.value })}
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="contact_email">Contact Email *</Label>
              <Input
                id="contact_email"
                type="email"
                value={formData.contact_email}
                onChange={(e) => setFormData({ ...formData, contact_email: e.target.value })}
                required
              />
            </div>
            <SiteClassificationFields
              clientId={formData.client_id}
              branchId={formData.branch_id}
              propertyTypeId={formData.property_type_id}
              status={formData.status}
              clients={clients}
              branches={branches}
              propertyTypes={propertyTypes}
              onClientChange={handleClientChange}
              onBranchChange={handleBranchChange}
              onPropertyTypeChange={handlePropertyTypeChange}
            />
            <div className="grid gap-2">
              <Label htmlFor="status">Site Status</Label>
              <Select
                value={formData.status}
                onValueChange={(value) =>
                  setFormData({ ...formData, status: value as 'live' | 'dead' })
                }
              >
                <SelectTrigger id="status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="live">Live</SelectItem>
                  <SelectItem value="dead">Dead</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Dead sites are paused and will not generate any new tasks.
              </p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="reporting_email">Reporting Email Addresses</Label>
              <p className="text-xs text-muted-foreground">
                Email addresses that will receive completed test reports
              </p>
              <div className="flex gap-2">
                <Input
                  id="reporting_email"
                  type="email"
                  value={newReportingEmail}
                  onChange={(e) => setNewReportingEmail(e.target.value)}
                  placeholder="report@example.com"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      handleAddReportingEmail()
                    }
                  }}
                />
                <Button type="button" variant="outline" onClick={handleAddReportingEmail}>
                  Add
                </Button>
              </div>
              {reportingEmails.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {reportingEmails.map((email) => (
                    <Badge key={email} variant="secondary" className="gap-1">
                      {email}
                      <button
                        type="button"
                        onClick={() => handleRemoveReportingEmail(email)}
                        className="ml-1 hover:text-destructive"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>
            <div className="rounded-lg border p-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <Label htmlFor="has_remote_monitoring" className="text-sm font-medium">
                    Remote Monitoring
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Does this site have a remotely monitored alarm system?
                  </p>
                </div>
                <Switch
                  id="has_remote_monitoring"
                  checked={formData.has_remote_monitoring}
                  onCheckedChange={(checked) =>
                    setFormData({
                      ...formData,
                      has_remote_monitoring: checked,
                      remote_monitoring_type: checked ? formData.remote_monitoring_type : '',
                    })
                  }
                />
              </div>
              {formData.has_remote_monitoring && (
                <div className="mt-4 grid gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="remote_monitoring_type">Monitoring Type</Label>
                    <Select
                      value={formData.remote_monitoring_type}
                      onValueChange={(value) =>
                        setFormData({
                          ...formData,
                          remote_monitoring_type: value as 'fire' | 'fire_and_fault' | 'fault',
                        })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select what is monitored" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="fire">Fire</SelectItem>
                        <SelectItem value="fire_and_fault">Fire and Fault</SelectItem>
                        <SelectItem value="fault">Fault only</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="monitoring_station_name">Monitoring Station Name</Label>
                    <Input
                      id="monitoring_station_name"
                      value={formData.monitoring_station_name}
                      onChange={(e) =>
                        setFormData({ ...formData, monitoring_station_name: e.target.value })
                      }
                      placeholder="e.g., ABC Alarm Receiving Centre"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="monitoring_station_phone">Station Phone</Label>
                    <Input
                      id="monitoring_station_phone"
                      type="tel"
                      value={formData.monitoring_station_phone}
                      onChange={(e) =>
                        setFormData({ ...formData, monitoring_station_phone: e.target.value })
                      }
                      placeholder="e.g., 0800 123 4567"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="monitoring_station_url">Station Website / Portal URL</Label>
                    <Input
                      id="monitoring_station_url"
                      type="url"
                      value={formData.monitoring_station_url}
                      onChange={(e) =>
                        setFormData({ ...formData, monitoring_station_url: e.target.value })
                      }
                      placeholder="https://..."
                    />
                  </div>
                </div>
              )}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              />
            </div>
          </div>
          {error && (
            <p className="text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2 mb-2">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save Changes'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
