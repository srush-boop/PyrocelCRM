'use client'

import { useState } from 'react'
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
import { Loader2 } from 'lucide-react'
import { SupplierFormFields, type SupplierFormData } from './supplier-form-fields'
import type { ServiceType, Supplier } from '@/lib/types/database'

interface EditSupplierDialogProps {
  supplier: Supplier
  serviceTypes: Pick<ServiceType, 'id' | 'name'>[]
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function EditSupplierDialog({
  supplier,
  serviceTypes,
  open,
  onOpenChange,
}: EditSupplierDialogProps) {
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState<SupplierFormData>({
    name: supplier.name,
    supplier_type: supplier.supplier_type,
    contact_name: supplier.contact_name || '',
    contact_email: supplier.contact_email || '',
    contact_phone: supplier.contact_phone || '',
    website: supplier.website || '',
    address: supplier.address || '',
    account_number: supplier.account_number || '',
    order_email: supplier.order_email || '',
    portal_url: supplier.portal_url || '',
    portal_username: supplier.portal_username || '',
    portal_password: supplier.portal_password || '',
    notes: supplier.notes || '',
    status: supplier.status,
  })
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>(
    supplier.service_type_ids ?? [],
  )
  const router = useRouter()
  const supabase = createClient()

  const handleChange = <K extends keyof SupplierFormData>(field: K, value: SupplierFormData[K]) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  const toggleService = (id: string) => {
    setSelectedServiceIds((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id],
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    const { error } = await supabase
      .from('suppliers')
      .update({
        name: formData.name,
        supplier_type: formData.supplier_type,
        contact_name: formData.contact_name || null,
        contact_email: formData.contact_email || null,
        contact_phone: formData.contact_phone || null,
        website: formData.website || null,
        address: formData.address || null,
        account_number: formData.account_number || null,
        order_email: formData.order_email || null,
        portal_url: formData.portal_url || null,
        portal_username: formData.portal_username || null,
        portal_password: formData.portal_password || null,
        notes: formData.notes || null,
        status: formData.status,
        updated_at: new Date().toISOString(),
      })
      .eq('id', supplier.id)

    // Re-sync provided services: clear then insert current selection.
    if (!error) {
      await supabase.from('supplier_services').delete().eq('supplier_id', supplier.id)
      if (formData.supplier_type === 'subcontractor' && selectedServiceIds.length > 0) {
        await supabase.from('supplier_services').insert(
          selectedServiceIds.map((service_type_id) => ({
            supplier_id: supplier.id,
            service_type_id,
          })),
        )
      }
    }

    setLoading(false)

    if (!error) {
      onOpenChange(false)
      router.refresh()
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Edit Supplier</DialogTitle>
            <DialogDescription>Update supplier details</DialogDescription>
          </DialogHeader>
          <SupplierFormFields
            formData={formData}
            onChange={handleChange}
            serviceTypes={serviceTypes}
            selectedServiceIds={selectedServiceIds}
            onToggleService={toggleService}
            showStatus
          />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading || !formData.name}>
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
