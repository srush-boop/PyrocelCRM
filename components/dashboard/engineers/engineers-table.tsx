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
  CalendarClock,
  CheckCircle2,
  KeyRound,
  Send,
  Pencil,
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
import type { Profile, UserRole, Department, Branch } from '@/lib/types/database'
import { formatDateUK } from '@/lib/utils'
import { InviteEngineerDialog } from './invite-engineer-dialog'

const NO_DEPARTMENT = '__none__'
const NO_BRANCH = '__none__'

interface EngineersTableProps {
  users: Profile[]
  departments: Department[]
  branches?: Branch[]
}

const roleColors: Record<UserRole, string> = {
  admin: 'bg-primary text-primary-foreground',
  engineer: 'bg-accent text-accent-foreground',
  office: 'bg-secondary text-secondary-foreground',
  client: 'bg-muted text-muted-foreground',
}

export function EngineersTable({ users, departments, branches = [] }: EngineersTableProps) {
  const departmentName = (id: string | null) =>
    id ? departments.find((d) => d.id === id)?.name ?? null : null
  const branchName = (id: string | null) =>
    id ? branches.find((b) => b.id === id)?.name ?? null : null
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
  const [editUser, setEditUser] = useState<Profile | null>(null)
  const [editForm, setEditForm] = useState({
    full_name: '',
    email: '',
    role: 'engineer' as UserRole,
    department_id: NO_DEPARTMENT,
    branch_id: NO_BRANCH,
    status: 'active' as 'active' | 'inactive',
  })
  const [editError, setEditError] = useState<string | null>(null)
  const [savingEdit, setSavingEdit] = useState(false)
  const [hoursUser, setHoursUser] = useState<Profile | null>(null)
  const [hoursForm, setHoursForm] = useState({
    work_start_time: '',
    work_end_time: '',
    lunch_minutes: '',
  })
  const [hoursError, setHoursError] = useState<string | null>(null)
  const [savingHours, setSavingHours] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  // Normalises a stored "HH:MM:SS" time to the "HH:MM" an <input type="time"> wants.
  const toTimeInput = (t: string | null) => (t ? t.slice(0, 5) : '')

  const openHoursDialog = (user: Profile) => {
    setHoursUser(user)
    setHoursForm({
      work_start_time: toTimeInput(user.work_start_time),
      work_end_time: toTimeInput(user.work_end_time),
      lunch_minutes: user.lunch_minutes != null ? String(user.lunch_minutes) : '',
    })
    setHoursError(null)
  }

  const handleSaveHours = async () => {
    if (!hoursUser) return
    const { work_start_time, work_end_time, lunch_minutes } = hoursForm
    // Either set both times or neither.
    if ((work_start_time && !work_end_time) || (!work_start_time && work_end_time)) {
      setHoursError('Please set both a start and end time, or leave both blank.')
      return
    }
    if (work_start_time && work_end_time && work_end_time <= work_start_time) {
      setHoursError('End time must be after the start time.')
      return
    }
    const lunch = lunch_minutes === '' ? null : Number(lunch_minutes)
    if (lunch != null && (Number.isNaN(lunch) || lunch < 0 || lunch > 480)) {
      setHoursError('Lunch allowance must be between 0 and 480 minutes.')
      return
    }
    setHoursError(null)
    setSavingHours(true)
    const { error } = await supabase
      .from('profiles')
      .update({
        work_start_time: work_start_time || null,
        work_end_time: work_end_time || null,
        lunch_minutes: lunch,
        updated_at: new Date().toISOString(),
      })
      .eq('id', hoursUser.id)
    setSavingHours(false)
    if (error) {
      setHoursError(error.message)
      return
    }
    setHoursUser(null)
    router.refresh()
  }

  const openPasswordDialog = (user: Profile) => {
    setPasswordUser(user)
    setNewPassword('')
    setConfirmPassword('')
    setPasswordError(null)
  }

  const openEditDialog = (user: Profile) => {
    setEditUser(user)
    setEditForm({
      full_name: user.full_name || '',
      email: user.email,
      role: user.role,
      department_id: user.department_id ?? NO_DEPARTMENT,
      branch_id: user.branch_id ?? NO_BRANCH,
      status: user.status,
    })
    setEditError(null)
  }

  const handleSaveProfile = async () => {
    if (!editUser) return
    if (!editForm.full_name.trim()) {
      setEditError('Please enter a name.')
      return
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(editForm.email.trim())) {
      setEditError('Please enter a valid email address.')
      return
    }
    setEditError(null)
    setSavingEdit(true)
    try {
      const res = await fetch(`/api/users/${editUser.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: editForm.full_name.trim(),
          email: editForm.email.trim(),
          role: editForm.role,
          department_id: editForm.department_id === NO_DEPARTMENT ? null : editForm.department_id,
          branch_id: editForm.branch_id === NO_BRANCH ? null : editForm.branch_id,
          status: editForm.status,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setEditError(data.error || 'Failed to update profile.')
      } else {
        setEditUser(null)
        router.refresh()
      }
    } catch {
      setEditError('An unexpected error occurred.')
    } finally {
      setSavingEdit(false)
    }
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

  const handleDepartmentChange = async (userId: string, value: string) => {
    await supabase
      .from('profiles')
      .update({
        department_id: value === NO_DEPARTMENT ? null : value,
        updated_at: new Date().toISOString(),
      })
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
              <TableHead>Department</TableHead>
              {branches.length > 0 && <TableHead>Branch</TableHead>}
              <TableHead>Status</TableHead>
              <TableHead className="hidden lg:table-cell">Invited</TableHead>
              <TableHead className="hidden lg:table-cell">Accepted</TableHead>
              <TableHead className="w-[70px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredUsers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={branches.length > 0 ? 9 : 8} className="h-24 text-center">
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
                    <Select
                      value={user.department_id ?? NO_DEPARTMENT}
                      onValueChange={(value) => handleDepartmentChange(user.id, value)}
                    >
                      <SelectTrigger className="h-8 w-[160px]" aria-label={`Department for ${user.full_name || user.email}`}>
                        <SelectValue placeholder="No department">
                          {departmentName(user.department_id) ?? 'No department'}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NO_DEPARTMENT}>No department</SelectItem>
                        {departments
                          .filter((d) => d.active || d.id === user.department_id)
                          .map((d) => (
                            <SelectItem key={d.id} value={d.id}>
                              {d.name}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  {branches.length > 0 && (
                    <TableCell>
                      {branchName(user.branch_id) ? (
                        <Badge variant="secondary">{branchName(user.branch_id)}</Badge>
                      ) : (
                        <span className="text-muted-foreground text-sm">-</span>
                      )}
                    </TableCell>
                  )}
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
                  <TableCell className="hidden text-muted-foreground lg:table-cell">
                    {user.invited_at ? formatDateUK(user.invited_at) : '-'}
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground lg:table-cell">
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
                        <DropdownMenuItem onClick={() => openEditDialog(user)}>
                          <Pencil className="mr-2 h-4 w-4" />
                          Edit Profile
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
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
                        <DropdownMenuItem onClick={() => openHoursDialog(user)}>
                          <CalendarClock className="mr-2 h-4 w-4" />
                          Working Hours
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

      <InviteEngineerDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        departments={departments}
      />

      <Dialog
        open={!!editUser}
        onOpenChange={(open) => !open && !savingEdit && setEditUser(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Profile</DialogTitle>
            <DialogDescription>
              Update the details for{' '}
              <strong>{editUser?.full_name || editUser?.email}</strong>.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="edit-name">Full name</Label>
              <Input
                id="edit-name"
                value={editForm.full_name}
                onChange={(e) => setEditForm({ ...editForm, full_name: e.target.value })}
                placeholder="Full name"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-email">Email address</Label>
              <Input
                id="edit-email"
                type="email"
                value={editForm.email}
                onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                placeholder="name@example.com"
                autoComplete="off"
              />
              <p className="text-xs text-muted-foreground">
                Changing this updates the address they sign in with.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="edit-role">Role</Label>
                <Select
                  value={editForm.role}
                  onValueChange={(value) => setEditForm({ ...editForm, role: value as UserRole })}
                >
                  <SelectTrigger id="edit-role">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="office">Office</SelectItem>
                    <SelectItem value="engineer">Engineer</SelectItem>
                    <SelectItem value="client">Client</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-status">Status</Label>
                <Select
                  value={editForm.status}
                  onValueChange={(value) =>
                    setEditForm({ ...editForm, status: value as 'active' | 'inactive' })
                  }
                >
                  <SelectTrigger id="edit-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="edit-department">Department</Label>
                <Select
                  value={editForm.department_id}
                  onValueChange={(value) => setEditForm({ ...editForm, department_id: value })}
                >
                  <SelectTrigger id="edit-department">
                    <SelectValue placeholder="No department" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_DEPARTMENT}>No department</SelectItem>
                    {departments
                      .filter((d) => d.active || d.id === editForm.department_id)
                      .map((d) => (
                        <SelectItem key={d.id} value={d.id}>
                          {d.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-branch">Branch</Label>
                <Select
                  value={editForm.branch_id}
                  onValueChange={(value) => setEditForm({ ...editForm, branch_id: value })}
                >
                  <SelectTrigger id="edit-branch">
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
            </div>
            {editError && <p className="text-sm text-destructive">{editError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditUser(null)} disabled={savingEdit}>
              Cancel
            </Button>
            <Button onClick={handleSaveProfile} disabled={savingEdit}>
              {savingEdit && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {savingEdit ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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

      <Dialog
        open={!!hoursUser}
        onOpenChange={(open) => !open && !savingHours && setHoursUser(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Working Hours</DialogTitle>
            <DialogDescription>
              Set the standard working hours for{' '}
              <strong>{hoursUser?.full_name || hoursUser?.email}</strong>. These are optional
              and will be used for future timesheets.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="work-start">Start time</Label>
                <Input
                  id="work-start"
                  type="time"
                  value={hoursForm.work_start_time}
                  onChange={(e) =>
                    setHoursForm({ ...hoursForm, work_start_time: e.target.value })
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="work-end">End time</Label>
                <Input
                  id="work-end"
                  type="time"
                  value={hoursForm.work_end_time}
                  onChange={(e) =>
                    setHoursForm({ ...hoursForm, work_end_time: e.target.value })
                  }
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lunch-minutes">Lunch allowance (minutes per day)</Label>
              <Input
                id="lunch-minutes"
                type="number"
                min={0}
                max={480}
                step={5}
                inputMode="numeric"
                value={hoursForm.lunch_minutes}
                onChange={(e) =>
                  setHoursForm({ ...hoursForm, lunch_minutes: e.target.value })
                }
                placeholder="e.g. 30"
              />
              <p className="text-xs text-muted-foreground">
                Deducted from daily working time when calculating timesheets.
              </p>
            </div>
            {hoursError && <p className="text-sm text-destructive">{hoursError}</p>}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setHoursUser(null)}
              disabled={savingHours}
            >
              Cancel
            </Button>
            <Button onClick={handleSaveHours} disabled={savingHours}>
              {savingHours && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {savingHours ? 'Saving...' : 'Save Hours'}
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
