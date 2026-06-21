'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import {
  MoreHorizontal,
  Search,
  Users,
  Plus,
  Trash2,
  Loader2,
  Clock,
  CheckCircle2,
  KeyRound,
  Send,
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import type { Profile, UserRole } from '@/lib/types/database'
import { formatDateUK } from '@/lib/utils'
import { InviteEngineerDialog } from './invite-engineer-dialog'

interface EngineersTableProps {
  users: Profile[]
}

const roleColors: Record<UserRole, string> = {
  admin: 'bg-primary text-primary-foreground',
  engineer: 'bg-accent text-accent-foreground',
  office: 'bg-secondary text-secondary-foreground',
}

export function EngineersTable({ users }: EngineersTableProps) {
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState<string>('all')
  const [inviteOpen, setInviteOpen] = useState(false)
  const [deleteUser, setDeleteUser] = useState<Profile | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [passwordUser, setPasswordUser] = useState<Profile | null>(null)
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [savingPassword, setSavingPassword] = useState(false)
  const [resendingId, setResendingId] = useState<string | null>(null)
  const router = useRouter()
  const supabase = createClient()

  const openPasswordDialog = (user: Profile) => {
    setPasswordUser(user)
    setNewPassword('')
    setConfirmPassword('')
    setPasswordError(null)
  }

  const handleChangePassword = async () => {
    if (!passwordUser) return
    if (newPassword.length < 6) {
      setPasswordError('Password must be at least 6 characters.')
      return
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('Passwords do not match.')
      return
    }
    setPasswordError(null)
    setSavingPassword(true)
    try {
      const res = await fetch(`/api/users/${passwordUser.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: newPassword }),
      })
      const data = await res.json()
      if (!res.ok) {
        setPasswordError(data.error || 'Failed to update password.')
      } else {
        setPasswordUser(null)
      }
    } catch {
      setPasswordError('An unexpected error occurred.')
    } finally {
      setSavingPassword(false)
    }
  }

  const filteredUsers = users.filter((user) => {
    const matchesSearch =
      user.full_name?.toLowerCase().includes(search.toLowerCase()) ||
      user.email.toLowerCase().includes(search.toLowerCase())
    const matchesRole = roleFilter === 'all' || user.role === roleFilter
    return matchesSearch && matchesRole
  })

  const handleResendInvite = async (user: Profile) => {
    setResendingId(user.id)
    try {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: user.email,
        options: {
          emailRedirectTo:
            process.env.NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL ??
            `${window.location.origin}/auth/callback`,
        },
      })
      if (error) {
        alert(`Failed to resend invite: ${error.message}`)
      } else {
        await supabase
          .from('profiles')
          .update({ invited_at: new Date().toISOString() })
          .eq('id', user.id)
        alert(`Invite resent to ${user.email}.`)
        router.refresh()
      }
    } catch {
      alert('An unexpected error occurred.')
    } finally {
      setResendingId(null)
    }
  }

  const handleRoleChange = async (userId: string, newRole: UserRole) => {
    await supabase
      .from('profiles')
      .update({ role: newRole, updated_at: new Date().toISOString() })
      .eq('id', userId)
    router.refresh()
  }

  const handleDelete = async () => {
    if (!deleteUser) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/users/${deleteUser.id}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) {
        alert(data.error || 'Failed to delete user.')
      } else {
        setDeleteUser(null)
        router.refresh()
      }
    } catch {
      alert('An unexpected error occurred.')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search users..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={roleFilter} onValueChange={setRoleFilter}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Filter by role" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Roles</SelectItem>
            <SelectItem value="admin">Admin</SelectItem>
            <SelectItem value="engineer">Engineer</SelectItem>
            <SelectItem value="office">Office</SelectItem>
          </SelectContent>
        </Select>
        <Button onClick={() => setInviteOpen(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          Add Member
        </Button>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Invited</TableHead>
              <TableHead>Accepted</TableHead>
              <TableHead className="w-[70px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredUsers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center">
                  <div className="flex flex-col items-center justify-center">
                    <Users className="h-8 w-8 text-muted-foreground/50 mb-2" />
                    <p className="text-muted-foreground">No users found</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              filteredUsers.map((user) => (
                <TableRow key={user.id}>
                  <TableCell className="font-medium">
                    {user.full_name || 'Unnamed User'}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {user.email}
                  </TableCell>
                  <TableCell>
                    <Badge className={roleColors[user.role]} variant="secondary">
                      {user.role}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {user.accepted_at ? (
                      <span className="flex items-center gap-1.5 text-green-600">
                        <CheckCircle2 className="h-4 w-4" />
                        Active
                      </span>
                    ) : user.invited_at ? (
                      <span className="flex items-center gap-1.5 text-amber-600">
                        <Clock className="h-4 w-4" />
                        Pending
                      </span>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {user.invited_at ? formatDateUK(user.invited_at) : '-'}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {user.accepted_at ? formatDateUK(user.accepted_at) : '-'}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handleRoleChange(user.id, 'admin')}>
                          Set as Admin
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleRoleChange(user.id, 'engineer')}>
                          Set as Engineer
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleRoleChange(user.id, 'office')}>
                          Set as Office
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        {!user.accepted_at && (
                          <DropdownMenuItem
                            onClick={() => handleResendInvite(user)}
                            disabled={resendingId === user.id}
                          >
                            {resendingId === user.id ? (
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                              <Send className="mr-2 h-4 w-4" />
                            )}
                            Resend Invite
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem onClick={() => openPasswordDialog(user)}>
                          <KeyRound className="mr-2 h-4 w-4" />
                          Change Password
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={() => setDeleteUser(user)}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete User
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <InviteEngineerDialog open={inviteOpen} onOpenChange={setInviteOpen} />

      <Dialog
        open={!!passwordUser}
        onOpenChange={(open) => !open && !savingPassword && setPasswordUser(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change Password</DialogTitle>
            <DialogDescription>
              Set a new password for{' '}
              <strong>{passwordUser?.full_name || passwordUser?.email}</strong>. They can use it to
              sign in immediately.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="new-password">New password</Label>
              <Input
                id="new-password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="At least 6 characters"
                autoComplete="new-password"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirm-password">Confirm password</Label>
              <Input
                id="confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter the password"
                autoComplete="new-password"
              />
            </div>
            {passwordError && <p className="text-sm text-destructive">{passwordError}</p>}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setPasswordUser(null)}
              disabled={savingPassword}
            >
              Cancel
            </Button>
            <Button onClick={handleChangePassword} disabled={savingPassword}>
              {savingPassword && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {savingPassword ? 'Saving...' : 'Update Password'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteUser} onOpenChange={(open) => !open && setDeleteUser(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete user?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete{' '}
              <strong>{deleteUser?.full_name || deleteUser?.email}</strong> and revoke
              their access. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {deleting ? 'Deleting...' : 'Delete User'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
