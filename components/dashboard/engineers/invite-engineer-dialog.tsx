'use client'

import { useState } from 'react'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2, RefreshCw, Copy, Check, UserPlus } from 'lucide-react'
import type { UserRole, Department, Branch } from '@/lib/types/database'

const NO_DEPARTMENT = '__none__'
const NO_BRANCH = '__none__'

interface InviteEngineerDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  departments: Department[]
  branches?: Branch[]
}

/** Generates a readable but strong temporary password. */
function generatePassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
  const pick = (n: number) =>
    Array.from({ length: n }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
  // e.g. "Kd7m-Pq4t-9xR2"
  return `${pick(4)}-${pick(4)}-${pick(4)}`
}

export function InviteEngineerDialog({
  open,
  onOpenChange,
  departments,
  branches = [],
}: InviteEngineerDialogProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  // When set, the account was created — show the shareable credentials.
  const [created, setCreated] = useState<{ email: string; password: string } | null>(null)
  const [formData, setFormData] = useState({
    email: '',
    full_name: '',
    role: 'engineer' as UserRole,
    department_id: NO_DEPARTMENT,
    branch_id: NO_BRANCH,
    password: generatePassword(),
  })
  const router = useRouter()

  const resetForm = () => {
    setFormData({
      email: '',
      full_name: '',
      role: 'engineer',
      department_id: NO_DEPARTMENT,
      branch_id: NO_BRANCH,
      password: generatePassword(),
    })
    setError(null)
    setCreated(null)
    setCopied(false)
  }

  const handleClose = (next: boolean) => {
    if (loading) return
    if (!next) {
      // Refresh on close if we created someone, so the table updates.
      if (created) router.refresh()
      resetForm()
    }
    onOpenChange(next)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email.trim())) {
      setError('Please enter a valid email address.')
      return
    }
    if (formData.password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: formData.email.trim(),
          password: formData.password,
          fullName: formData.full_name.trim() || null,
          role: formData.role,
          departmentId: formData.department_id === NO_DEPARTMENT ? null : formData.department_id,
          branchId: formData.branch_id === NO_BRANCH ? null : formData.branch_id,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Failed to create user.')
      } else {
        setCreated({ email: formData.email.trim(), password: formData.password })
      }
    } catch {
      setError('An unexpected error occurred.')
    } finally {
      setLoading(false)
    }
  }

  const handleCopy = async () => {
    if (!created) return
    const text = `Email: ${created.email}\nPassword: ${created.password}`
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard may be unavailable; ignore.
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent>
        {created ? (
          <>
            <DialogHeader>
              <DialogTitle>User created</DialogTitle>
              <DialogDescription>
                Share these sign-in details with the team member. This password won&apos;t be shown
                again, so copy it now.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3">
              <div className="rounded-md border bg-muted/40 p-4 font-mono text-sm">
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">Email</span>
                  <span className="text-right break-all">{created.email}</span>
                </div>
                <div className="mt-2 flex justify-between gap-4">
                  <span className="text-muted-foreground">Password</span>
                  <span className="text-right break-all">{created.password}</span>
                </div>
              </div>
              <Button type="button" variant="outline" className="w-full gap-2" onClick={handleCopy}>
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {copied ? 'Copied' : 'Copy details'}
              </Button>
            </div>

            <DialogFooter className="gap-2 sm:gap-2">
              <Button type="button" variant="outline" onClick={resetForm}>
                Add another
              </Button>
              <Button type="button" onClick={() => handleClose(false)}>
                Done
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Add Team Member</DialogTitle>
              <DialogDescription>
                Create a staff account and set their password. You&apos;ll then share the sign-in
                details with them directly — no email invitation is sent.
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid gap-2">
                <Label htmlFor="email">Email *</Label>
                <Input
                  id="email"
                  type="email"
                  required
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="engineer@example.com"
                  disabled={loading}
                  autoComplete="off"
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="name">Full Name</Label>
                <Input
                  id="name"
                  type="text"
                  value={formData.full_name}
                  onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                  placeholder="John Smith"
                  disabled={loading}
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="password">Password *</Label>
                <div className="flex gap-2">
                  <Input
                    id="password"
                    type="text"
                    required
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    placeholder="At least 8 characters"
                    disabled={loading}
                    autoComplete="new-password"
                    className="font-mono"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => setFormData({ ...formData, password: generatePassword() })}
                    disabled={loading}
                    aria-label="Generate password"
                  >
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  You&apos;ll be shown these details to share after the account is created.
                </p>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="role">Role *</Label>
                <Select
                  value={formData.role}
                  onValueChange={(value) => setFormData({ ...formData, role: value as UserRole })}
                >
                  <SelectTrigger id="role" disabled={loading}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="engineer">Engineer</SelectItem>
                    <SelectItem value="office">Office Staff</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="department">Department</Label>
                <Select
                  value={formData.department_id}
                  onValueChange={(value) => setFormData({ ...formData, department_id: value })}
                >
                  <SelectTrigger id="department" disabled={loading}>
                    <SelectValue placeholder="No department" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_DEPARTMENT}>No department</SelectItem>
                    {departments
                      .filter((d) => d.active)
                      .map((d) => (
                        <SelectItem key={d.id} value={d.id}>
                          {d.name} ({d.default_margin_percent ?? 0}% margin)
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>

              {branches.length > 0 && (
                <div className="grid gap-2">
                  <Label htmlFor="branch">Branch</Label>
                  <Select
                    value={formData.branch_id}
                    onValueChange={(value) => setFormData({ ...formData, branch_id: value })}
                  >
                    <SelectTrigger id="branch" disabled={loading}>
                      <SelectValue placeholder="No branch" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NO_BRANCH}>No branch</SelectItem>
                      {branches.map((b) => (
                        <SelectItem key={b.id} value={b.id}>
                          {b.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {error && <p className="text-sm text-destructive">{error}</p>}

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => handleClose(false)}
                  disabled={loading}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={loading} className="gap-2">
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <UserPlus className="h-4 w-4" />
                  )}
                  {loading ? 'Creating...' : 'Create User'}
                </Button>
              </DialogFooter>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
