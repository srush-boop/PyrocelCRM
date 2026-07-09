'use client'

import { memo } from 'react'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface NamedRecord {
  id: string
  name: string
}

interface SiteClassificationFieldsProps {
  clientId: string
  branchId: string
  propertyTypeId: string
  /** When 'live', the client field is marked required. */
  status: string
  clients: NamedRecord[]
  branches: NamedRecord[]
  propertyTypes: NamedRecord[]
  onClientChange: (value: string) => void
  onBranchChange: (value: string) => void
  onPropertyTypeChange: (value: string) => void
}

/**
 * The client / branch / property-type Select group for the add & edit site
 * dialogs. Extracted and memoized so that typing in the form's text fields
 * (name, address, contacts, etc.) doesn't force these relatively expensive
 * Radix Selects to reconcile on every keystroke. As long as the caller passes
 * stable `onChange` callbacks (via useCallback) and stable option arrays, this
 * only re-renders when one of the selected values actually changes.
 */
export const SiteClassificationFields = memo(function SiteClassificationFields({
  clientId,
  branchId,
  propertyTypeId,
  status,
  clients,
  branches,
  propertyTypes,
  onClientChange,
  onBranchChange,
  onPropertyTypeChange,
}: SiteClassificationFieldsProps) {
  return (
    <>
      <div className="grid gap-2">
        <Label htmlFor="client">
          Client {status === 'live' && <span className="text-destructive">*</span>}
        </Label>
        <Select value={clientId} onValueChange={onClientChange}>
          <SelectTrigger>
            <SelectValue placeholder="Select client (optional)" />
          </SelectTrigger>
          <SelectContent>
            {clients.map((client) => (
              <SelectItem key={client.id} value={client.id}>
                {client.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {branches.length > 0 && (
        <div className="grid gap-2">
          <Label htmlFor="branch">Branch</Label>
          <Select
            value={branchId || 'none'}
            onValueChange={(value) => onBranchChange(value === 'none' ? '' : value)}
          >
            <SelectTrigger>
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
        </div>
      )}
      {propertyTypes.length > 0 && (
        <div className="grid gap-2">
          <Label htmlFor="property_type">Property Type</Label>
          <Select
            value={propertyTypeId || 'none'}
            onValueChange={(value) => onPropertyTypeChange(value === 'none' ? '' : value)}
          >
            <SelectTrigger>
              <SelectValue placeholder="No property type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No property type</SelectItem>
              {propertyTypes.map((pt) => (
                <SelectItem key={pt.id} value={pt.id}>
                  {pt.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </>
  )
})
