'use client'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { HardHat, Package } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { SupplierType } from '@/lib/types/database'

export interface SupplierFormData {
  name: string
  supplier_type: SupplierType
  contact_name: string
  contact_email: string
  contact_phone: string
  website: string
  address: string
  account_number: string
  order_email: string
  portal_url: string
  portal_username: string
  portal_password: string
  notes: string
  status: 'active' | 'inactive'
}

interface ServiceOption {
  id: string
  name: string
}

interface SupplierFormFieldsProps {
  formData: SupplierFormData
  onChange: <K extends keyof SupplierFormData>(field: K, value: SupplierFormData[K]) => void
  serviceTypes: ServiceOption[]
  selectedServiceIds: string[]
  onToggleService: (id: string) => void
  /** Show the status selector (edit mode only). */
  showStatus?: boolean
}

export function SupplierFormFields({
  formData,
  onChange,
  serviceTypes,
  selectedServiceIds,
  onToggleService,
  showStatus = false,
}: SupplierFormFieldsProps) {
  const isSubcontractor = formData.supplier_type === 'subcontractor'

  return (
    <div className="grid gap-4 py-4">
      {/* Supplier type chooser */}
      <div className="grid gap-2">
        <Label>Supplier type *</Label>
        <RadioGroup
          value={formData.supplier_type}
          onValueChange={(value) => onChange('supplier_type', value as SupplierType)}
          className="grid grid-cols-2 gap-3"
        >
          <Label
            htmlFor="type-product"
            className={cn(
              'flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors',
              !isSubcontractor ? 'border-primary bg-primary/5' : 'border-border',
            )}
          >
            <RadioGroupItem value="product" id="type-product" className="mt-0.5" />
            <div className="grid gap-0.5">
              <span className="flex items-center gap-1.5 font-medium">
                <Package className="h-4 w-4" />
                Product supplier
              </span>
              <span className="text-xs text-muted-foreground">
                Supplies equipment and parts you order
              </span>
            </div>
          </Label>
          <Label
            htmlFor="type-subcontractor"
            className={cn(
              'flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors',
              isSubcontractor ? 'border-primary bg-primary/5' : 'border-border',
            )}
          >
            <RadioGroupItem value="subcontractor" id="type-subcontractor" className="mt-0.5" />
            <div className="grid gap-0.5">
              <span className="flex items-center gap-1.5 font-medium">
                <HardHat className="h-4 w-4" />
                Sub-contractor
              </span>
              <span className="text-xs text-muted-foreground">
                Carries out services on your behalf
              </span>
            </div>
          </Label>
        </RadioGroup>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="name">Company / Name *</Label>
        <Input
          id="name"
          value={formData.name}
          onChange={(e) => onChange('name', e.target.value)}
          placeholder="e.g., Acme Supplies Ltd"
          required
        />
      </div>

      {/* Services provided — sub-contractors only */}
      {isSubcontractor && (
        <div className="grid gap-2">
          <Label>Services provided</Label>
          <p className="text-xs text-muted-foreground">
            Select the services this sub-contractor can carry out. These are used to choose
            sub-contractors when assigning work.
          </p>
          {serviceTypes.length === 0 ? (
            <p className="text-sm text-muted-foreground">No service types configured.</p>
          ) : (
            <div className="grid max-h-48 grid-cols-1 gap-2 overflow-y-auto rounded-md border p-3 sm:grid-cols-2">
              {serviceTypes.map((service) => (
                <Label
                  key={service.id}
                  htmlFor={`service-${service.id}`}
                  className="flex cursor-pointer items-center gap-2 text-sm font-normal"
                >
                  <Checkbox
                    id={`service-${service.id}`}
                    checked={selectedServiceIds.includes(service.id)}
                    onCheckedChange={() => onToggleService(service.id)}
                  />
                  {service.name}
                </Label>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="contact_name">Contact Name</Label>
          <Input
            id="contact_name"
            value={formData.contact_name}
            onChange={(e) => onChange('contact_name', e.target.value)}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="contact_phone">Contact Phone</Label>
          <Input
            id="contact_phone"
            value={formData.contact_phone}
            onChange={(e) => onChange('contact_phone', e.target.value)}
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="contact_email">Contact Email</Label>
          <Input
            id="contact_email"
            type="email"
            value={formData.contact_email}
            onChange={(e) => onChange('contact_email', e.target.value)}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="order_email">Order Email</Label>
          <Input
            id="order_email"
            type="email"
            value={formData.order_email}
            onChange={(e) => onChange('order_email', e.target.value)}
            placeholder="orders@supplier.com"
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="website">Website</Label>
          <Input
            id="website"
            value={formData.website}
            onChange={(e) => onChange('website', e.target.value)}
            placeholder="https://"
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="account_number">Account Number</Label>
          <Input
            id="account_number"
            value={formData.account_number}
            onChange={(e) => onChange('account_number', e.target.value)}
          />
        </div>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="address">Address</Label>
        <Textarea
          id="address"
          value={formData.address}
          onChange={(e) => onChange('address', e.target.value)}
        />
      </div>

      {/* Portal / account login details */}
      <div className="rounded-lg border border-border p-3">
        <p className="mb-3 text-sm font-medium">Our account login</p>
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="portal_url">Portal / Login URL</Label>
            <Input
              id="portal_url"
              value={formData.portal_url}
              onChange={(e) => onChange('portal_url', e.target.value)}
              placeholder="https://portal.supplier.com/login"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="portal_username">Username</Label>
              <Input
                id="portal_username"
                value={formData.portal_username}
                onChange={(e) => onChange('portal_username', e.target.value)}
                autoComplete="off"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="portal_password">Password</Label>
              <Input
                id="portal_password"
                value={formData.portal_password}
                onChange={(e) => onChange('portal_password', e.target.value)}
                autoComplete="off"
              />
            </div>
          </div>
        </div>
      </div>

      {showStatus && (
        <div className="grid gap-2">
          <Label htmlFor="status">Status</Label>
          <Select
            value={formData.status}
            onValueChange={(value) => onChange('status', value as 'active' | 'inactive')}
          >
            <SelectTrigger id="status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="grid gap-2">
        <Label htmlFor="notes">Notes</Label>
        <Textarea
          id="notes"
          value={formData.notes}
          onChange={(e) => onChange('notes', e.target.value)}
        />
      </div>
    </div>
  )
}
