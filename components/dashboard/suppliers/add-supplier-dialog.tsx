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
  DialogTrigger,
} from '@/components/ui/dialog'
import { Plus, Loader2 } from 'lucide-react'
import { SupplierFormFields, type SupplierFormData } from './supplier-form-fields'
import type { ServiceType, SupplierType } from '@/lib/types/database'

const EMPTY: SupplierFormData = {
  name: '',
  supplier_type: 'product',
  contact_name: '',
  contact_email: '',
  contact_phone: '',
  website: '',
  address: '',
  account_number: '',
  order_email: '',
  portal_url: '',
  portal_username: '',
  portal_password: '',
  notes: '',
  status: 'active',
}

interface AddSupplierDialogProps {
  serviceTypes: Pick<ServiceType, 'id' | 'name'>[]
  /** Preselect a supplier type (e.g. when adding from a filtered view). */
  defaultType?: SupplierType
}

export function AddSupplierDialog({ serviceTypes, defaultType }: AddSupplierDialogProps) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState<SupplierFormData>({
    ...EMPTY,
    supplier_type: defaultType ?? 'product',
  })
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>([])
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

  const reset = () => {
    setFormData({ ...EMPTY, supplier_type: defaultType ?? 'product' })
    setSelectedServiceIds([])
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    const isSub = formData.supplier_type === 'subcontractor'

    const { data: inserted, error } = await supabase
      .from('suppliers')
      .insert({
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
      })
      .select('id')
      .single()

    // Persist provided services for sub-contractors.
    if (!error && isSub && inserted && selectedServiceIds.length > 0) {
      await supabase.from('supplier_services').insert(
        selectedServiceIds.map((service_type_id) => ({
          supplier_id: (inserted as { id: string }).id,
          service_type_id,
        })),
      )
    }

    setLoading(false)

    if (!error) {
      setOpen(false)
      reset()
      router.refresh()
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (!o) reset()
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Add Supplier
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Add Supplier</DialogTitle>
            <DialogDescription>
              Add a product supplier or a sub-contractor
            </DialogDescription>
          </DialogHeader>
          <SupplierFormFields
            formData={formData}
            onChange={handleChange}
            serviceTypes={serviceTypes}
            selectedServiceIds={selectedServiceIds}
            onToggleService={toggleService}
          />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading || !formData.name}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Adding...
                </>
              ) : (
                'Add Supplier'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
