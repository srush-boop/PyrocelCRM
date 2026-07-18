'use client'

import { useState, useTransition } from 'react'
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
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
import { Loader2, Plus, Pencil, Trash2 } from 'lucide-react'
import type { Profile, Role } from '@/lib/types/database'

type PickUser = Pick<Profile, 'id' | 'full_name' | 'role'>

interface RolesSettingsProps {
  roles: Role[]
  users: PickUser[]
}

interface FormState {
  id?: string
  name: string
  description: string
  active: boolean
  timesheet_required: boolean
  lone_worker_enabled: boolean
  // Entered in pounds; converted to integer pence on save.
  cost_per_hour_pounds: string
  // Default timesheet approver(s)/processor(s) for this role.
  timesheet_approver_ids: string[]
  timesheet_processor_ids: string[]
}

function emptyForm(): FormState {
  return {
    name: '',
    description: '',
    active: true,
    timesheet_required: true,
    lone_worker_enabled: false,
    cost_per_hour_pounds: '',
    timesheet_approver_ids: [],
    timesheet_processor_ids: [],
  }
}

function toggleId(list: string[], id: string): string[] {
  return list.includes(id) ? list.filter((x) => x !== id) : [...list, id]
}

/** Pence → pounds string for editing (empty when unset). */
function penceToPounds(pence: number | null | undefined): string {
  if (pence == null) return ''
  return (pence / 100).toFixed(2)
}

/** Pounds string → integer pence, or null when blank/invalid. */
function poundsToPence(pounds: string): number | null {
  const n = Number.parseFloat(pounds)
  if (!Number.isFinite(n) || n < 0) return null
  return Math.round(n * 100)
}

export function RolesSettings({ roles, users }: RolesSettingsProps) {
  const router = useRouter()
  const supabase = createClient()
  const [isPending, startTransition] = useTransition()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [form, setForm] = useState<FormState>(emptyForm())
  const [deleteTarget, setDeleteTarget] = useState<Role | null>(null)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  function openCreate() {
    setForm(emptyForm())
    setMessage(null)
    setDialogOpen(true)
  }

  function openEdit(role: Role) {
    setForm({
      id: role.id,
      name: role.name,
      description: role.description ?? '',
      active: role.active,
      timesheet_required: role.timesheet_required,
      lone_worker_enabled: role.lone_worker_enabled ?? false,
      cost_per_hour_pounds: penceToPounds(role.cost_per_hour_pence),
      timesheet_approver_ids: role.timesheet_approver_ids ?? [],
      timesheet_processor_ids: role.timesheet_processor_ids ?? [],
    })
    setMessage(null)
    setDialogOpen(true)
  }

  function handleSave() {
    if (!form.name.trim()) {
      setMessage({ type: 'error', text: 'Role name is required.' })
      return
    }
    startTransition(async () => {
      const payload = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        active: form.active,
        timesheet_required: form.timesheet_required,
        lone_worker_enabled: form.lone_worker_enabled,
        cost_per_hour_pence: poundsToPence(form.cost_per_hour_pounds),
        timesheet_approver_ids: form.timesheet_approver_ids,
        timesheet_processor_ids: form.timesheet_processor_ids,
        updated_at: new Date().toISOString(),
      }
      const { error } = form.id
        ? await supabase.from('roles').update(payload).eq('id', form.id)
        : await supabase.from('roles').insert(payload)

      if (error) {
        setMessage({ type: 'error', text: error.message })
        return
      }
      setDialogOpen(false)
      router.refresh()
    })
  }

  function handleDelete() {
    if (!deleteTarget) return
    const target = deleteTarget
    startTransition(async () => {
      const { error } = await supabase.from('roles').delete().eq('id', target.id)
      setDeleteTarget(null)
      if (error) {
        setMessage({ type: 'error', text: error.message })
        return
      }
      router.refresh()
    })
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle>Roles</CardTitle>
          <CardDescription>
            Descriptive job roles (e.g. Lead Engineer, Estimator) shown on documents and
            communications alongside each person&apos;s signature. Roles do not affect permissions.
          </CardDescription>
        </div>
        <Button onClick={openCreate} className="gap-2">
          <Plus className="h-4 w-4" />
          Add role
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {message && (
          <div
            className={`rounded-lg p-3 text-sm ${
              message.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'
            }`}
          >
            {message.text}
          </div>
        )}

        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Cost / hr</TableHead>
                <TableHead>Timesheet</TableHead>
                <TableHead>Lone worker</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {roles.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">
                    No roles yet. Add one to assign it to your team members.
                  </TableCell>
                </TableRow>
              ) : (
                roles.map((role) => (
                  <TableRow key={role.id}>
                    <TableCell className="font-medium">{role.name}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {role.description || '—'}
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {role.cost_per_hour_pence != null
                        ? `£${(role.cost_per_hour_pence / 100).toFixed(2)}`
                        : '—'}
                    </TableCell>
                    <TableCell>
                      <Badge variant={role.timesheet_required ? 'default' : 'outline'}>
                        {role.timesheet_required ? 'Required' : 'Not required'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={role.lone_worker_enabled ? 'default' : 'outline'}>
                        {role.lone_worker_enabled ? 'Enabled' : 'Off'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={role.active ? 'default' : 'secondary'}>
                        {role.active ? 'Active' : 'Inactive'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openEdit(role)}
                          aria-label={`Edit ${role.name}`}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setDeleteTarget(role)}
                          aria-label={`Delete ${role.name}`}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{form.id ? 'Edit role' : 'Add role'}</DialogTitle>
            <DialogDescription>
              This label appears on generated documents and communications for users assigned to it.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-1.5">
              <Label htmlFor="r-name">Name</Label>
              <Input
                id="r-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Lead Engineer"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="r-description">Description</Label>
              <Textarea
                id="r-description"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Optional summary of this role"
                rows={3}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="r-cost">Cost / hour (£)</Label>
              <Input
                id="r-cost"
                type="number"
                min={0}
                step="0.01"
                value={form.cost_per_hour_pounds}
                onChange={(e) => setForm({ ...form, cost_per_hour_pounds: e.target.value })}
                placeholder="e.g. 28.50"
                className="sm:max-w-[10rem]"
              />
              <p className="text-xs text-muted-foreground">
                Default labour cost for people with this role, used to cost calls. A per-user
                override takes precedence when set.
              </p>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.active}
                onChange={(e) => setForm({ ...form, active: e.target.checked })}
                className="h-4 w-4 rounded border-input"
              />
              Active
            </label>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.timesheet_required}
                onChange={(e) => setForm({ ...form, timesheet_required: e.target.checked })}
                className="mt-0.5 h-4 w-4 rounded border-input"
              />
              <span>
                Timesheet required
                <span className="block text-xs text-muted-foreground">
                  Default for users with this role. Can be overridden per user.
                </span>
              </span>
            </label>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.lone_worker_enabled}
                onChange={(e) => setForm({ ...form, lone_worker_enabled: e.target.checked })}
                className="mt-0.5 h-4 w-4 rounded border-input"
              />
              <span>
                Lone worker safety
                <span className="block text-xs text-muted-foreground">
                  People with this role can start a lone-worker shift and receive safety check-ins.
                </span>
              </span>
            </label>

            {form.timesheet_required && (
              <div className="grid gap-4 rounded-lg border p-3 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <p className="text-sm font-medium">Timesheet workflow</p>
                  <p className="text-xs text-muted-foreground">
                    Default approver(s) and processor(s) for this role. A per-user
                    override wins when set; otherwise these apply. If both are empty,
                    approval falls back to the person&apos;s manager and processing to
                    office/admin.
                  </p>
                </div>
                <div>
                  <Label className="text-xs">Approver(s)</Label>
                  <div className="mt-1 max-h-40 space-y-1 overflow-y-auto rounded-md border p-2">
                    {users.length === 0 ? (
                      <p className="text-xs text-muted-foreground">No users.</p>
                    ) : (
                      users.map((u) => (
                        <label key={u.id} className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded border-input"
                            checked={form.timesheet_approver_ids.includes(u.id)}
                            onChange={() =>
                              setForm({
                                ...form,
                                timesheet_approver_ids: toggleId(
                                  form.timesheet_approver_ids,
                                  u.id,
                                ),
                              })
                            }
                          />
                          {u.full_name ?? 'Unnamed'}
                        </label>
                      ))
                    )}
                  </div>
                </div>
                <div>
                  <Label className="text-xs">Processor(s)</Label>
                  <div className="mt-1 max-h-40 space-y-1 overflow-y-auto rounded-md border p-2">
                    {users.length === 0 ? (
                      <p className="text-xs text-muted-foreground">No users.</p>
                    ) : (
                      users.map((u) => (
                        <label key={u.id} className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded border-input"
                            checked={form.timesheet_processor_ids.includes(u.id)}
                            onChange={() =>
                              setForm({
                                ...form,
                                timesheet_processor_ids: toggleId(
                                  form.timesheet_processor_ids,
                                  u.id,
                                ),
                              })
                            }
                          />
                          {u.full_name ?? 'Unnamed'}
                        </label>
                      ))
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={isPending}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={isPending}>
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {form.id ? 'Save changes' : 'Create role'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleteTarget?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Users assigned this role will be unassigned. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                handleDelete()
              }}
              disabled={isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}
