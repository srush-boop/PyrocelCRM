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
import { AddressFinder } from '@/components/dashboard/shared/address-finder'
import type { PlaceResult } from '@/app/api/places-search/route'
import { createBillingAccount } from '@/lib/actions/billing-accounts'

interface AddClientDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const EMPTY_FORM = {
  name: '',
  contact_name: '',
  contact_email: '',
  contact_phone: '',
  address: '',
  postcode: '',
  notes: '',
  requires_po: false,
}

const EMPTY_SITE = {
  name: '',
  address: '',
  postcode: '',
  contact_name: '',
  contact_phone: '',
  contact_email: '',
}

export function AddClientDialog({ open, onOpenChange }: AddClientDialogProps) {
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({ ...EMPTY_FORM })
  // Whether this client is also the billing client (default yes). When on, a
  // default billing account is created for them, inheriting their address/contact.
  const [isBillingClient, setIsBillingClient] = useState(true)
  // Optional "create a site for this client at the same time" flow.
  const [createSite, setCreateSite] = useState(false)
  const [sameAddress, setSameAddress] = useState(true)
  const [siteData, setSiteData] = useState({ ...EMPTY_SITE })
  const router = useRouter()
  const supabase = createClient()

  // Merge the resolved locality into the single address field, optionally
  // prefixing the postcode so it's captured too.
  const applyPostcode = (r: { postcode: string; locality: string }) => {
    setFormData((prev) => {
      const line = [r.locality, r.postcode].filter(Boolean).join(', ')
      if (!line) return prev
      const hasIt = prev.address.toLowerCase().includes(r.postcode.toLowerCase())
      const address = hasIt
        ? prev.address
        : [prev.address.trim(), line].filter(Boolean).join(', ')
      return { ...prev, address, postcode: r.postcode || prev.postcode }
    })
  }

  // Fill company name, address and contact details from a Google Places result.
  const applyPlace = (p: PlaceResult) => {
    setFormData((prev) => ({
      ...prev,
      name: prev.name || p.name,
      address: p.address || prev.address,
      postcode: p.postcode || prev.postcode,
      contact_phone: p.phone || prev.contact_phone,
    }))
  }

  // A separate finder for the site (used when it differs from the client).
  const applySitePlace = (p: PlaceResult) => {
    setSiteData((prev) => ({
      ...prev,
      name: prev.name || p.name,
      address: p.address || prev.address,
      postcode: p.postcode || prev.postcode,
      contact_phone: p.phone || prev.contact_phone,
    }))
  }

  const resetAll = () => {
    setFormData({ ...EMPTY_FORM })
    setSiteData({ ...EMPTY_SITE })
    setIsBillingClient(true)
    setCreateSite(false)
    setSameAddress(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    const { data: insertedClient, error } = await supabase
      .from('clients')
      .insert({
        name: formData.name,
        contact_name: formData.contact_name || null,
        contact_email: formData.contact_email || null,
        contact_phone: formData.contact_phone || null,
        address: formData.address || null,
        notes: formData.notes || null,
        requires_po: formData.requires_po,
      })
      .select('id')
      .single()

    if (error || !insertedClient) {
      setLoading(false)
      console.error('[v0] Error creating client:', error)
      alert(`Error creating client: ${error?.message ?? 'unknown error'}`)
      return
    }

    // When the client is also the billing client, create a default billing
    // account for them inheriting their address/contact details.
    if (isBillingClient) {
      const { error: baError } = await createBillingAccount(insertedClient.id, {
        name: formData.name,
        invoice_address: formData.address || null,
        invoice_contact_name: formData.contact_name || null,
        invoice_email: formData.contact_email || null,
        invoice_phone: formData.contact_phone || null,
      })
      if (baError) {
        // Client exists; surface the billing issue without losing the client.
        console.log('[v0] Error creating default billing account:', baError)
      }
    }

    // Optionally create the client's first site in the same step.
    let newSiteId: string | null = null
    if (createSite) {
      const siteName = (sameAddress ? formData.name : siteData.name).trim()
      const siteAddress = (sameAddress ? formData.address : siteData.address).trim()
      const { data: insertedSite, error: siteError } = await supabase
        .from('sites')
        .insert({
          client_id: insertedClient.id,
          name: siteName || formData.name,
          address: siteAddress || formData.address,
          postcode: sameAddress ? formData.postcode || '' : siteData.postcode || '',
          contact_name: sameAddress ? formData.contact_name || null : siteData.contact_name || null,
          contact_phone: sameAddress
            ? formData.contact_phone || null
            : siteData.contact_phone || null,
          contact_email: sameAddress
            ? formData.contact_email || null
            : siteData.contact_email || null,
          status: 'live',
        })
        .select('id')
        .single()
      if (siteError) {
        // Client was created; surface the site issue but don't lose the client.
        console.log('[v0] Error creating site for new client:', siteError)
        alert(`Client created, but the site could not be added: ${siteError.message}`)
      } else {
        newSiteId = insertedSite?.id ?? null
      }
    }

    setLoading(false)
    onOpenChange(false)
    resetAll()
    // If a site was created, jump to its Systems tab; otherwise just refresh.
    if (newSiteId) {
      router.push(`/dashboard/sites/${newSiteId}?tab=systems`)
    } else {
      router.refresh()
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add Client</DialogTitle>
          <DialogDescription>
            Add a new client company to associate with sites
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <AddressFinder
              label="Find business or address"
              hint="Search by company name or address to auto-fill the details below."
              onSelect={applyPlace}
            />
            <div className="grid gap-2">
              <Label htmlFor="name">Company Name *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Acme Corporation"
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
                  placeholder="John Smith"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="contact_phone">Phone</Label>
                <Input
                  id="contact_phone"
                  value={formData.contact_phone}
                  onChange={(e) => setFormData({ ...formData, contact_phone: e.target.value })}
                  placeholder="0191 123456"
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
                placeholder="contact@company.com"
              />
            </div>
            <PostcodeLookup id="client-postcode-lookup" onResolved={applyPostcode} />
            <div className="grid gap-2">
              <Label htmlFor="address">Address</Label>
              <Input
                id="address"
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                placeholder="123 Business Park, City"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="Any additional notes about this client"
              />
            </div>
            <div className="flex items-start justify-between gap-3 rounded-md border p-3">
              <div className="min-w-0">
                <Label htmlFor="is_billing_client" className="text-sm font-medium">
                  This client is also the billing client
                </Label>
                <p className="mt-0.5 text-xs text-muted-foreground text-pretty">
                  Creates a default billing account for them so their work can be invoiced. Turn
                  off if invoices are sent to a different company (a parent or managing agent).
                </p>
              </div>
              <Switch
                id="is_billing_client"
                checked={isBillingClient}
                onCheckedChange={setIsBillingClient}
              />
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

            {/* Optionally create the client's first site in the same step. */}
            <div className="rounded-md border p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <Label htmlFor="create_site" className="text-sm font-medium">
                    Also create a site for this client
                  </Label>
                  <p className="mt-0.5 text-xs text-muted-foreground text-pretty">
                    Sets up the client&apos;s first site now. You&apos;ll be taken to it afterwards
                    to add systems and services.
                  </p>
                </div>
                <Switch id="create_site" checked={createSite} onCheckedChange={setCreateSite} />
              </div>

              {createSite && (
                <div className="mt-3 grid gap-3 border-t pt-3">
                  <div className="flex items-center justify-between gap-3">
                    <Label htmlFor="same_address" className="text-sm">
                      Site address is the same as the client address
                    </Label>
                    <Switch
                      id="same_address"
                      checked={sameAddress}
                      onCheckedChange={setSameAddress}
                    />
                  </div>

                  {sameAddress ? (
                    <p className="text-xs text-muted-foreground">
                      The site will be named after the client and use the client address and
                      contact details above.
                    </p>
                  ) : (
                    <div className="grid gap-3">
                      <AddressFinder
                        label="Find site business or address"
                        hint="Search for the site if it differs from the client."
                        onSelect={applySitePlace}
                      />
                      <div className="grid gap-2">
                        <Label htmlFor="site_name">Site Name *</Label>
                        <Input
                          id="site_name"
                          value={siteData.name}
                          onChange={(e) => setSiteData({ ...siteData, name: e.target.value })}
                          placeholder="e.g., Head Office"
                          required={createSite && !sameAddress}
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="site_address">Site Address *</Label>
                        <Textarea
                          id="site_address"
                          value={siteData.address}
                          onChange={(e) => setSiteData({ ...siteData, address: e.target.value })}
                          placeholder="Full site address"
                          required={createSite && !sameAddress}
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="site_postcode">Site Postcode</Label>
                        <Input
                          id="site_postcode"
                          value={siteData.postcode}
                          onChange={(e) => setSiteData({ ...siteData, postcode: e.target.value })}
                          placeholder="e.g., AB12 3CD"
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading || !formData.name}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Add Client
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
