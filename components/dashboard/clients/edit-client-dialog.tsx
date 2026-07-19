'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
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
import { Switch } from '@/components/ui/switch'
import { Loader2 } from 'lucide-react'
import { PostcodeLookup } from '@/components/dashboard/shared/postcode-lookup'
import type { Client } from '@/lib/types/database'

interface EditClientDialogProps {
  client: Client
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function EditClientDialog({ client, open, onOpenChange }: EditClientDialogProps) {
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    name: client.name,
    contact_name: client.contact_name || '',
    contact_email: client.contact_email || '',
    contact_phone: client.contact_phone || '',
    address: client.address || '',
    notes: client.notes || '',
    po_number: client.po_number || '',
    requires_po: client.requires_po ?? false,
    invoice_calls_individually: client.invoice_calls_individually ?? false,
  })
  const router = useRouter()
  const supabase = createClient()

  // Merge the resolved locality + postcode into the single address field.
  const applyPostcode = (r: { postcode: string; locality: string }) => {
    setFormData((prev) => {
      const line = [r.locality, r.postcode].filter(Boolean).join(', ')
      if (!line) return prev
      const hasIt = prev.address.toLowerCase().includes(r.postcode.toLowerCase())
      const address = hasIt
        ? prev.address
        : [prev.address.trim(), line].filter(Boolean).join(', ')
      return { ...prev, address }
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    const { error } = await supabase
      .from('clients')
      .update({
        name: formData.name,
        contact_name: formData.contact_name || null,
        contact_email: formData.contact_email || null,
        contact_phone: formData.contact_phone || null,
        address: formData.address || null,
        notes: formData.notes || null,
        po_number: formData.po_number.trim() || null,
        requires_po: formData.requires_po,
        invoice_calls_individually: formData.invoice_calls_individually,
        updated_at: new Date().toISOString(),
      })
      .eq('id', client.id)

    setLoading(false)

    if (error) {
      console.error('[v0] Error updating client:', error)
      alert(`Error updating client: ${error.message}`)
    } else {
      onOpenChange(false)
      router.refresh()
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Edit Client</DialogTitle>
          <DialogDescription>
            Update client company information
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="name">Company Name *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
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
                <Label htmlFor="contact_phone">Phone</Label>
                <Input
                  id="contact_phone"
                  value={formData.contact_phone}
                  onChange={(e) => setFormData({ ...formData, contact_phone: e.target.value })}
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="contact_email">Email</Label>
              <Input
                id="contact_email"
                type="email"
                value={formData.contact_email}
                onChange={(e) => setFormData({ ...formData, contact_email: e.target.value })}
              />
            </div>
            <PostcodeLookup id="edit-client-postcode-lookup" onResolved={applyPostcode} />
            <div className="grid gap-2">
              <Label htmlFor="address">Address</Label>
              <Input
                id="address"
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="client_po">Default PO number</Label>
              <Input
                id="client_po"
                value={formData.po_number}
                onChange={(e) => setFormData({ ...formData, po_number: e.target.value })}
                placeholder="Fallback customer PO for this client"
              />
              <p className="text-xs text-muted-foreground text-pretty">
                Used on invoices when the site, system or service charge has no PO of its own.
              </p>
            </div>
            <div className="flex items-start justify-between gap-3 rounded-md border p-3">
              <div className="min-w-0">
                <Label htmlFor="requires_po" className="text-sm font-medium">
                  Requires PO before invoicing
                </Label>
                <p className="mt-0.5 text-xs text-muted-foreground text-pretty">
                  Chargeable calls for this client can&apos;t be submitted for invoicing until a PO
                  number is entered (or marked not required on the call).
                </p>
              </div>
              <Switch
                id="requires_po"
                checked={formData.requires_po}
                onCheckedChange={(v) => setFormData({ ...formData, requires_po: v })}
              />
            </div>
            <div className="flex items-start justify-between gap-3 rounded-md border p-3">
              <div className="min-w-0">
                <Label htmlFor="invoice_calls_individually" className="text-sm font-medium">
                  Invoice calls individually
                </Label>
                <p className="mt-0.5 text-xs text-muted-foreground text-pretty">
                  Raise one invoice per call for this client instead of grouping calls into a
                  single bulk invoice.
                </p>
              </div>
              <Switch
                id="invoice_calls_individually"
                checked={formData.invoice_calls_individually}
                onCheckedChange={(v) =>
                  setFormData({ ...formData, invoice_calls_individually: v })
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading || !formData.name}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
