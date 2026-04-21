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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Plus, Loader2 } from 'lucide-react'
import type { UserRole } from '@/lib/types/database'

interface InviteEngineerDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function InviteEngineerDialog({ open, onOpenChange }: InviteEngineerDialogProps) {
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    email: '',
    full_name: '',
    role: 'engineer' as UserRole,
  })
  const router = useRouter()
  const supabase = createClient()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      // Create auth user (without password - they'll set it on first login)
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: formData.email,
        password: Math.random().toString(36).slice(-12), // Random temporary password
        options: {
          data: {
            full_name: formData.full_name,
            role: formData.role,
          },
          emailRedirectTo:
            process.env.NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL ??
            `${window.location.origin}/auth/callback`,
        },
      })

      if (authError) {
        console.error('[v0] Auth signup error:', authError)
        alert(`Error creating user: ${authError.message}`)
        setLoading(false)
        return
      }

      // The profile is auto-created by the trigger, but ensure it has the correct role and invited_at
      if (authData.user) {
        const { error: profileError } = await supabase
          .from('profiles')
          .update({
            full_name: formData.full_name,
            role: formData.role,
            invited_at: new Date().toISOString(),
          })
          .eq('id', authData.user.id)

        if (profileError) {
          console.error('[v0] Profile update error:', profileError)
        }
      }

      setLoading(false)
      onOpenChange(false)
      setFormData({
        email: '',
        full_name: '',
        role: 'engineer',
      })
      router.refresh()
    } catch (error) {
      console.error('[v0] Unexpected error:', error)
      alert('An unexpected error occurred')
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite Engineer/Staff Member</DialogTitle>
          <DialogDescription>
            Add a new team member to your organization
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
            <Label htmlFor="role">Role *</Label>
            <Select value={formData.role} onValueChange={(value) =>
              setFormData({ ...formData, role: value as UserRole })
            }>
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

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {loading ? 'Inviting...' : 'Send Invite'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
