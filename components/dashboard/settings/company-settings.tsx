'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Building2, MapPin, Plus, Pencil, Trash2, Loader2 } from 'lucide-react'
import type { CompanyInfo, Branch } from '@/lib/types/database'

interface CompanySettingsProps {
  company: CompanyInfo | null
  branches: Branch[]
}

type Feedback = { type: 'success' | 'error'; text: string } | null

const EMPTY_BRANCH = { name: '', address: '', phone: '', email: '' }

export function CompanySettings({ company, branches }: CompanySettingsProps) {
  const router = useRouter()
  const supabase = createClient()

  const [form, setForm] = useState({
    name: company?.name || 'Pyrocel Ltd',
    address: company?.address || '',
    phone: company?.phone || '',
    email: company?.email || '',
    website: company?.website || '',
    registration_number: company?.registration_number || '',
    vat_number: company?.vat_number || '',
    logo_url: company?.logo_url || '',
    default_margin_percent: String(company?.default_margin_percent ?? 0),
    default_vat_rate: String(company?.default_vat_rate ?? 20),
    default_tax_code: company?.default_tax_code || 'T1',
  })
  const [savingCompany, setSavingCompany] = useState(false)
  const [companyMessage, setCompanyMessage] = useState<Feedback>(null)

  // Branch dialog state
  const [branchDialogOpen, setBranchDialogOpen] = useState(false)
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null)
  const [branchForm, setBranchForm] = useState(EMPTY_BRANCH)
  const [savingBranch, setSavingBranch] = useState(false)
  const [branchMessage, setBranchMessage] = useState<Feedback>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const handleSaveCompany = async (e: React.FormEvent) => {
    e.preventDefault()
    setSavingCompany(true)
    setCompanyMessage(null)

    const payload = {
      name: form.name.trim(),
      address: form.address.trim() || null,
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
      website: form.website.trim() || null,
      registration_number: form.registration_number.trim() || null,
      vat_number: form.vat_number.trim() || null,
      logo_url: form.logo_url.trim() || null,
      default_margin_percent: Number.parseFloat(form.default_margin_percent) || 0,
      default_vat_rate: Number.parseFloat(form.default_vat_rate) || 0,
      default_tax_code: form.default_tax_code.trim() || 'T1',
      updated_at: new Date().toISOString(),
    }

    const { error } = company
      ? await supabase.from('company_info').update(payload).eq('id', company.id)
      : await supabase.from('company_info').insert(payload)

    setSavingCompany(false)

    if (error) {
      setCompanyMessage({ type: 'error', text: 'Failed to save company information.' })
    } else {
      setCompanyMessage({ type: 'success', text: 'Company information saved.' })
      router.refresh()
    }
  }

  const openAddBranch = () => {
    setEditingBranch(null)
    setBranchForm(EMPTY_BRANCH)
    setBranchMessage(null)
    setBranchDialogOpen(true)
  }

  const openEditBranch = (branch: Branch) => {
    setEditingBranch(branch)
    setBranchForm({
      name: branch.name,
      address: branch.address || '',
      phone: branch.phone || '',
      email: branch.email || '',
    })
    setBranchMessage(null)
    setBranchDialogOpen(true)
  }

  const handleSaveBranch = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!branchForm.name.trim()) {
      setBranchMessage({ type: 'error', text: 'Branch name is required.' })
      return
    }
    setSavingBranch(true)
    setBranchMessage(null)

    const payload = {
      name: branchForm.name.trim(),
      address: branchForm.address.trim() || null,
      phone: branchForm.phone.trim() || null,
      email: branchForm.email.trim() || null,
      updated_at: new Date().toISOString(),
    }

    const { error } = editingBranch
      ? await supabase.from('branches').update(payload).eq('id', editingBranch.id)
      : await supabase.from('branches').insert(payload)

    setSavingBranch(false)

    if (error) {
      setBranchMessage({ type: 'error', text: 'Failed to save branch.' })
    } else {
      setBranchDialogOpen(false)
      router.refresh()
    }
  }

  const handleDeleteBranch = async (branch: Branch) => {
    setDeletingId(branch.id)
    const { error } = await supabase.from('branches').delete().eq('id', branch.id)
    setDeletingId(null)
    if (!error) router.refresh()
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Company Information
          </CardTitle>
          <CardDescription>
            These details appear on inspection report headers. The address is used as the company
            address on all reports.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSaveCompany} className="space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="company_name">Company Name</Label>
              <Input
                id="company_name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Company name"
                required
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="company_address">Address</Label>
              <Textarea
                id="company_address"
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                placeholder="Registered company address"
                rows={2}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="company_phone">Phone</Label>
                <Input
                  id="company_phone"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  placeholder="Phone number"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="company_email">Email</Label>
                <Input
                  id="company_email"
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="Email address"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="company_website">Website</Label>
                <Input
                  id="company_website"
                  value={form.website}
                  onChange={(e) => setForm({ ...form, website: e.target.value })}
                  placeholder="www.example.co.uk"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="company_logo">Logo URL</Label>
                <Input
                  id="company_logo"
                  value={form.logo_url}
                  onChange={(e) => setForm({ ...form, logo_url: e.target.value })}
                  placeholder="https://..."
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="company_reg">Registration Number</Label>
                <Input
                  id="company_reg"
                  value={form.registration_number}
                  onChange={(e) => setForm({ ...form, registration_number: e.target.value })}
                  placeholder="Company reg. number"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="company_vat">VAT Number</Label>
                <Input
                  id="company_vat"
                  value={form.vat_number}
                  onChange={(e) => setForm({ ...form, vat_number: e.target.value })}
                  placeholder="VAT number"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="company_margin">Default quote margin %</Label>
                <Input
                  id="company_margin"
                  inputMode="decimal"
                  value={form.default_margin_percent}
                  onChange={(e) => setForm({ ...form, default_margin_percent: e.target.value })}
                  placeholder="0"
                />
                <p className="text-xs text-muted-foreground">
                  Pre-filled on new quote systems and lines. Sell price = cost / (1 − margin%).
                </p>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="company_vat_rate">VAT rate %</Label>
                <Input
                  id="company_vat_rate"
                  inputMode="decimal"
                  value={form.default_vat_rate}
                  onChange={(e) => setForm({ ...form, default_vat_rate: e.target.value })}
                  placeholder="20"
                />
                <p className="text-xs text-muted-foreground">
                  Applied to all new invoices. Set to 0 for zero-rated.
                </p>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="company_tax_code">Sage tax code</Label>
                <Input
                  id="company_tax_code"
                  value={form.default_tax_code}
                  onChange={(e) => setForm({ ...form, default_tax_code: e.target.value })}
                  placeholder="T1"
                />
                <p className="text-xs text-muted-foreground">
                  Used in the Sage CSV export for every invoice line.
                </p>
              </div>
            </div>

            {companyMessage && (
              <div
                className={`rounded-lg p-3 text-sm ${
                  companyMessage.type === 'success'
                    ? 'bg-green-50 text-green-800'
                    : 'bg-red-50 text-red-800'
                }`}
              >
                {companyMessage.text}
              </div>
            )}

            <Button type="submit" disabled={savingCompany}>
              {savingCompany && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Company Information
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
          <div className="space-y-1.5">
            <CardTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5" />
              Branches
            </CardTitle>
            <CardDescription>
              Manage your company branches. These are saved for future use.
            </CardDescription>
          </div>
          <Button onClick={openAddBranch} size="sm" className="gap-1.5">
            <Plus className="h-4 w-4" />
            Add Branch
          </Button>
        </CardHeader>
        <CardContent>
          {branches.length === 0 ? (
            <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
              No branches added yet.
            </div>
          ) : (
            <ul className="divide-y">
              {branches.map((branch) => (
                <li key={branch.id} className="flex items-start justify-between gap-4 py-3">
                  <div className="min-w-0">
                    <p className="font-medium">{branch.name}</p>
                    {branch.address && (
                      <p className="text-sm text-muted-foreground">{branch.address}</p>
                    )}
                    <div className="flex flex-wrap gap-x-4 text-sm text-muted-foreground">
                      {branch.phone && <span>{branch.phone}</span>}
                      {branch.email && <span>{branch.email}</span>}
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => openEditBranch(branch)}
                      aria-label={`Edit ${branch.name}`}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDeleteBranch(branch)}
                      disabled={deletingId === branch.id}
                      aria-label={`Delete ${branch.name}`}
                    >
                      {deletingId === branch.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4 text-destructive" />
                      )}
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Dialog open={branchDialogOpen} onOpenChange={setBranchDialogOpen}>
        <DialogContent>
          <form onSubmit={handleSaveBranch}>
            <DialogHeader>
              <DialogTitle>{editingBranch ? 'Edit Branch' : 'Add Branch'}</DialogTitle>
              <DialogDescription>
                {editingBranch ? 'Update the branch details.' : 'Add a new company branch.'}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="branch_name">Branch Name</Label>
                <Input
                  id="branch_name"
                  value={branchForm.name}
                  onChange={(e) => setBranchForm({ ...branchForm, name: e.target.value })}
                  placeholder="e.g. North East"
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="branch_address">Address</Label>
                <Textarea
                  id="branch_address"
                  value={branchForm.address}
                  onChange={(e) => setBranchForm({ ...branchForm, address: e.target.value })}
                  placeholder="Branch address"
                  rows={2}
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="branch_phone">Phone</Label>
                  <Input
                    id="branch_phone"
                    value={branchForm.phone}
                    onChange={(e) => setBranchForm({ ...branchForm, phone: e.target.value })}
                    placeholder="Phone number"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="branch_email">Email</Label>
                  <Input
                    id="branch_email"
                    type="email"
                    value={branchForm.email}
                    onChange={(e) => setBranchForm({ ...branchForm, email: e.target.value })}
                    placeholder="Email address"
                  />
                </div>
              </div>
              {branchMessage && (
                <div
                  className={`rounded-lg p-3 text-sm ${
                    branchMessage.type === 'success'
                      ? 'bg-green-50 text-green-800'
                      : 'bg-red-50 text-red-800'
                  }`}
                >
                  {branchMessage.text}
                </div>
              )}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setBranchDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={savingBranch}>
                {savingBranch && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {editingBranch ? 'Save Changes' : 'Add Branch'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
