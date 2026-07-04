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
  CalendarClock,
  CheckCircle2,
  Ban,
  KeyRound,
  Pencil,
  PanelLeft,
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
import type { Profile, UserRole, Department, Branch, WorkDayHours } from '@/lib/types/database'
import { formatDateUK } from '@/lib/utils'
import { InviteEngineerDialog } from './invite-engineer-dialog'
import { MenuAccessDialog } from './menu-access-dialog'

const NO_DEPARTMENT = '__none__'
const NO_BRANCH = '__none__'
const NO_MANAGER = '__none__'

// ISO weekday numbers (1 = Monday ... 7 = Sunday) used for working patterns.
const WEEKDAYS: { value: number; label: string }[] = [
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
  { value: 7, label: 'Sun' },
]

// One weekday's row in the working-hours editor. `break_minutes` is kept as a
// string for the controlled number input.
type DayHoursForm = { active: boolean; start: string; end: string; break_minutes: string }

// A fresh, all-days-off week used to seed the working-hours form.
const emptyWeek = (): Record<number, DayHoursForm> =>
  WEEKDAYS.reduce(
    (acc, d) => {
      acc[d.value] = { active: false, start: '', end: '', break_minutes: '' }
      return acc
    },
    {} as Record<number, DayHoursForm>,
  )

// Normalises a stored "HH:MM:SS" time to the "HH:MM" an <input type="time"> wants.
const toTimeInput = (t: string | null) => (t ? t.slice(0, 5) : '')

// Net minutes for a day = (finish - start) - break. Returns null when the times
// are incomplete/invalid or the break exceeds the worked time.
const netDayMinutes = (start: string, end: string, breakMin: string): number | null => {
  if (!start || !end) return null
  const [sh, sm] = start.split(':').map(Number)
  const [eh, em] = end.split(':').map(Number)
  const startMin = sh * 60 + sm
  const endMin = eh * 60 + em
  if (Number.isNaN(startMin) || Number.isNaN(endMin) || endMin <= startMin) return null
  const brk = breakMin === '' ? 0 : Number(breakMin)
  const net = endMin - startMin - (Number.isNaN(brk) ? 0 : brk)
  return net > 0 ? net : null
}

// Formats net minutes as decimal hours (e.g. 450 -> "7.5"), trimming trailing zeros.
const formatDecimalHours = (mins: number): string =>
  (mins / 60).toFixed(2).replace(/\.?0+$/, '')

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
  const [editUser, setEditUser] = useState<Profile | null>(null)
  const [editForm, setEditForm] = useState({
    full_name: '',
    email: '',
    role: 'engineer' as UserRole,
    department_id: NO_DEPARTMENT,
    branch_id: NO_BRANCH,
    status: 'active' as 'active' | 'inactive',
    manager_id: NO_MANAGER,
    employee_number: '',
    holiday_entitlement_days: '',
    holiday_entitlement_hours: '',
  })
  const [editError, setEditError] = useState<string | null>(null)
  const [savingEdit, setSavingEdit] = useState(false)
  const [hoursUser, setHoursUser] = useState<Profile | null>(null)
  const [hoursForm, setHoursForm] = useState<Record<number, DayHoursForm>>(emptyWeek)
  const [hoursError, setHoursError] = useState<string | null>(null)
  const [savingHours, setSavingHours] = useState(false)
  const [menuAccessUser, setMenuAccessUser] = useState<Profile | null>(null)
  const router = useRouter()
  const supabase = createClient()

  const openHoursDialog = (user: Profile) => {
    setHoursUser(user)
    const form = emptyWeek()
    const stored = user.work_day_hours
    if (stored && Object.keys(stored).length > 0) {
      // Preferred: per-day hours already saved.
      for (const [day, entry] of Object.entries(stored)) {
        const d = Number(day)
        if (form[d]) {
          form[d] = {
            active: true,
            start: toTimeInput(entry.start),
            end: toTimeInput(entry.end),
            break_minutes: entry.break_minutes != null ? String(entry.break_minutes) : '',
          }
        }
      }
    } else {
      // Legacy fallback: apply the single start/finish/lunch to each work day.
      const days =
        user.work_days && user.work_days.length > 0 ? user.work_days : [1, 2, 3, 4, 5]
      for (const d of days) {
        if (form[d]) {
          form[d] = {
            active: true,
            start: toTimeInput(user.work_start_time),
            end: toTimeInput(user.work_end_time),
            break_minutes: user.lunch_minutes != null ? String(user.lunch_minutes) : '',
          }
        }
      }
    }
    setHoursForm(form)
    setHoursError(null)
  }

  // Total net minutes across all active, valid days.
  const weeklyMinutes = WEEKDAYS.reduce((sum, d) => {
    const f = hoursForm[d.value]
    if (!f?.active) return sum
    const mins = netDayMinutes(f.start, f.end, f.break_minutes)
    return sum + (mins ?? 0)
  }, 0)

  const handleSaveHours = async () => {
    if (!hoursUser) return
    const activeDays = WEEKDAYS.filter((d) => hoursForm[d.value]?.active)
    if (activeDays.length === 0) {
      setHoursError('Please enable at least one working day.')
      return
    }
    const workDayHours: WorkDayHours = {}
    for (const d of activeDays) {
      const { start, end, break_minutes } = hoursForm[d.value]
      if (!start || !end) {
        setHoursError(`${d.label}: please set both a start and finish time.`)
        return
      }
      if (end <= start) {
        setHoursError(`${d.label}: finish time must be after the start time.`)
        return
      }
      const brk = break_minutes === '' ? 0 : Number(break_minutes)
      if (Number.isNaN(brk) || brk < 0 || brk > 480) {
        setHoursError(`${d.label}: break must be between 0 and 480 minutes.`)
        return
      }
      if (netDayMinutes(start, end, String(brk)) == null) {
        setHoursError(`${d.label}: the break is longer than the working time.`)
        return
      }
      workDayHours[String(d.value)] = { start, end, break_minutes: brk }
    }
    const workDays = activeDays.map((d) => d.value).sort((a, b) => a - b)
    // Keep the legacy single fields in sync (using the earliest working day) so
    // anything still reading them gets sensible values.
    const first = workDayHours[String(workDays[0])]
    setHoursError(null)
    setSavingHours(true)
    const { error } = await supabase
      .from('profiles')
      .update({
        work_day_hours: workDayHours,
        work_days: workDays,
        work_start_time: first.start,
        work_end_time: first.end,
        lunch_minutes: first.break_minutes,
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
      manager_id: user.manager_id ?? NO_MANAGER,
      employee_number: user.employee_number ?? '',
      holiday_entitlement_days:
        user.holiday_entitlement_days != null ? String(user.holiday_entitlement_days) : '',
      holiday_entitlement_hours:
        user.holiday_entitlement_hours != null ? String(user.holiday_entitlement_hours) : '',
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
    // Holiday entitlement is optional; when provided it must be a non-negative number.
    const days = editForm.holiday_entitlement_days.trim()
    const hours = editForm.holiday_entitlement_hours.trim()
    if (days !== '' && (Number.isNaN(Number(days)) || Number(days) < 0)) {
      setEditError('Holiday entitlement (days) must be a positive number.')
      return
    }
    if (hours !== '' && (Number.isNaN(Number(hours)) || Number(hours) < 0)) {
      setEditError('Holiday entitlement (hours) must be a positive number.')
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
          manager_id: editForm.manager_id === NO_MANAGER ? null : editForm.manager_id,
          employee_number: editForm.employee_number.trim() || null,
          holiday_entitlement_days: days === '' ? null : Number(days),
          holiday_entitlement_hours: hours === '' ? null : Number(hours),
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
                      <TableHead className="hidden lg:table-cell">Added</TableHead>
              <TableHead className="w-[70px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredUsers.length === 0 ? (
              <TableRow>
                    <TableCell colSpan={branches.length > 0 ? 8 : 7} className="h-24 text-center">
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
                    {user.status === 'active' ? (
                      <span className="flex items-center gap-1.5 text-green-600">
                        <CheckCircle2 className="h-4 w-4" />
                        Active
                      </span>
                    ) : (
                      <span className="flex items-center gap-1.5 text-muted-foreground">
                        <Ban className="h-4 w-4" />
                        Inactive
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground lg:table-cell">
                    {user.created_at ? formatDateUK(user.created_at) : '-'}
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
                        <DropdownMenuItem onClick={() => openPasswordDialog(user)}>
                          <KeyRound className="mr-2 h-4 w-4" />
                          Change Password
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => openHoursDialog(user)}>
                          <CalendarClock className="mr-2 h-4 w-4" />
                          Working Hours
                        </DropdownMenuItem>
                        {user.role !== 'client' && (
                          <DropdownMenuItem onClick={() => setMenuAccessUser(user)}>
                            <PanelLeft className="mr-2 h-4 w-4" />
                            Menu Access
                          </DropdownMenuItem>
                        )}
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
        branches={branches}
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
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="edit-manager">Nominated manager</Label>
                <Select
                  value={editForm.manager_id}
                  onValueChange={(value) => setEditForm({ ...editForm, manager_id: value })}
                >
                  <SelectTrigger id="edit-manager">
                    <SelectValue placeholder="No manager" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_MANAGER}>No manager</SelectItem>
                    {users
                      .filter((u) => u.id !== editUser?.id && u.role !== 'client')
                      .map((u) => (
                        <SelectItem key={u.id} value={u.id}>
                          {u.full_name || u.email}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-employee-number">Employee number</Label>
                <Input
                  id="edit-employee-number"
                  value={editForm.employee_number}
                  onChange={(e) =>
                    setEditForm({ ...editForm, employee_number: e.target.value })
                  }
                  placeholder="e.g. EMP-0042"
                />
                <p className="text-xs text-muted-foreground">
                  Used to match training imports and for anonymised exports.
                </p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="edit-holiday-days">Holiday entitlement (days)</Label>
                <Input
                  id="edit-holiday-days"
                  type="number"
                  min={0}
                  step={0.5}
                  inputMode="decimal"
                  value={editForm.holiday_entitlement_days}
                  onChange={(e) =>
                    setEditForm({ ...editForm, holiday_entitlement_days: e.target.value })
                  }
                  placeholder="e.g. 25"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-holiday-hours">Holiday entitlement (hours)</Label>
                <Input
                  id="edit-holiday-hours"
                  type="number"
                  min={0}
                  step={0.5}
                  inputMode="decimal"
                  value={editForm.holiday_entitlement_hours}
                  onChange={(e) =>
                    setEditForm({ ...editForm, holiday_entitlement_hours: e.target.value })
                  }
                  placeholder="e.g. 200"
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Annual holiday entitlement. Days and hours are recorded separately.
            </p>
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
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Working Hours</DialogTitle>
            <DialogDescription>
              Set working hours per day for{' '}
              <strong>{hoursUser?.full_name || hoursUser?.email}</strong>. Enable each working
              day, then enter the start and finish time and any break. Net hours are worked out
              for you.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {/* Column headers (hidden on narrow screens where rows stack). */}
            <div className="hidden items-center gap-2 px-1 text-xs font-medium text-muted-foreground sm:grid sm:grid-cols-[4.5rem_1fr_1fr_6rem_4.5rem]">
              <span>Day</span>
              <span>Start</span>
              <span>Finish</span>
              <span>Break (min)</span>
              <span className="text-right">Hours</span>
            </div>
            {WEEKDAYS.map((day) => {
              const f = hoursForm[day.value]
              const mins = f.active ? netDayMinutes(f.start, f.end, f.break_minutes) : null
              const update = (patch: Partial<DayHoursForm>) =>
                setHoursForm((prev) => ({ ...prev, [day.value]: { ...prev[day.value], ...patch } }))
              return (
                <div
                  key={day.value}
                  className="grid grid-cols-2 items-center gap-2 rounded-md border px-2 py-2 sm:grid-cols-[4.5rem_1fr_1fr_6rem_4.5rem]"
                >
                  <Button
                    type="button"
                    size="sm"
                    variant={f.active ? 'default' : 'outline'}
                    aria-pressed={f.active}
                    className="w-full"
                    onClick={() => update({ active: !f.active })}
                  >
                    {day.label}
                  </Button>
                  <Input
                    type="time"
                    aria-label={`${day.label} start time`}
                    value={f.start}
                    disabled={!f.active}
                    onChange={(e) => update({ start: e.target.value })}
                  />
                  <Input
                    type="time"
                    aria-label={`${day.label} finish time`}
                    value={f.end}
                    disabled={!f.active}
                    onChange={(e) => update({ end: e.target.value })}
                  />
                  <Input
                    type="number"
                    min={0}
                    max={480}
                    step={5}
                    inputMode="numeric"
                    aria-label={`${day.label} break minutes`}
                    placeholder="0"
                    value={f.break_minutes}
                    disabled={!f.active}
                    onChange={(e) => update({ break_minutes: e.target.value })}
                  />
                  <span className="text-right text-sm font-medium tabular-nums">
                    {f.active ? (mins != null ? `${formatDecimalHours(mins)} h` : '—') : ''}
                  </span>
                </div>
              )
            })}
            <div className="flex items-center justify-between rounded-md border bg-muted/50 px-3 py-2">
              <span className="text-sm text-muted-foreground">Total weekly hours</span>
              <span className="text-sm font-semibold tabular-nums">
                {weeklyMinutes > 0 ? `${formatDecimalHours(weeklyMinutes)} h` : '—'}
              </span>
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

      <MenuAccessDialog
        user={menuAccessUser}
        onOpenChange={(open) => !open && setMenuAccessUser(null)}
      />
    </div>
  )
}
