'use client'

import { useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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
  Plus,
  Pencil,
  Trash2,
  FileDown,
  Loader2,
  GraduationCap,
  Search,
  Paperclip,
  Upload,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { ImportTrainingDialog } from '@/components/dashboard/training/import-training-dialog'
import { saveTrainingRecord, deleteTrainingRecord } from '@/lib/actions/training'
import type { Profile, Department, TrainingRecord } from '@/lib/types/database'

interface TrainingManagerProps {
  users: Profile[]
  departments: Department[]
  records: TrainingRecord[]
}

const ALL = '__all__'
const NO_PROFILE = ''

type TrainingStatus = 'expired' | 'expiring' | 'valid' | 'none'

// Classifies a record by its expiry date so the grid and filters can flag
// renewals. "expiring" means within 30 days.
function statusOf(expiry: string | null): TrainingStatus {
  if (!expiry) return 'none'
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  const exp = new Date(expiry + 'T00:00:00')
  if (Number.isNaN(exp.getTime())) return 'none'
  const days = Math.floor((exp.getTime() - now.getTime()) / 86_400_000)
  if (days < 0) return 'expired'
  if (days <= 30) return 'expiring'
  return 'valid'
}

function formatDate(value: string | null): string {
  if (!value) return '-'
  const d = new Date(value + 'T00:00:00')
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  office: 'Office',
  engineer: 'Engineer',
}

const STATUS_BADGE: Record<TrainingStatus, { label: string; className: string }> = {
  expired: { label: 'Expired', className: 'bg-destructive text-destructive-foreground' },
  expiring: { label: 'Expiring soon', className: 'bg-amber-500 text-white' },
  valid: { label: 'Valid', className: 'bg-green-600 text-white' },
  none: { label: 'No expiry', className: 'bg-muted text-muted-foreground' },
}

const emptyForm = {
  id: undefined as string | undefined,
  profile_id: NO_PROFILE,
  training_type: '',
  course_name: '',
  provider: '',
  completed_date: '',
  expiry_date: '',
  certificate_url: '' as string,
  certificate_pathname: '' as string,
  certificate_name: '' as string,
}

// The openable href for a certificate: uploaded files stream through the
// private serve route (by record id); external links open directly.
function certHref(record: TrainingRecord): string | null {
  if (record.certificate_pathname) return `/api/training/certificate/file?id=${record.id}`
  return record.certificate_url || null
}

export function TrainingManager({ users, departments, records }: TrainingManagerProps) {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [deptFilter, setDeptFilter] = useState(ALL)
  const [typeFilter, setTypeFilter] = useState(ALL)
  const [statusFilter, setStatusFilter] = useState(ALL)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const certFileRef = useRef<HTMLInputElement>(null)

  const userById = useMemo(() => new Map(users.map((u) => [u.id, u])), [users])
  const deptById = useMemo(() => new Map(departments.map((d) => [d.id, d])), [departments])

  const trainingTypes = useMemo(
    () => Array.from(new Set(records.map((r) => r.training_type).filter(Boolean))).sort(),
    [records],
  )

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    return records.filter((r) => {
      const profile = r.profile ?? userById.get(r.profile_id) ?? null
      if (deptFilter !== ALL && profile?.department_id !== deptFilter) return false
      if (typeFilter !== ALL && r.training_type !== typeFilter) return false
      if (statusFilter !== ALL && statusOf(r.expiry_date) !== statusFilter) return false
      if (term) {
        const haystack = [
          profile?.full_name,
          profile?.employee_number,
          r.training_type,
          r.course_name,
          r.provider,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
        if (!haystack.includes(term)) return false
      }
      return true
    })
  }, [records, search, deptFilter, typeFilter, statusFilter, userById])

  const openAdd = () => {
    setForm(emptyForm)
    setFormError(null)
    setDialogOpen(true)
  }

  const openEdit = (record: TrainingRecord) => {
    setForm({
      id: record.id,
      profile_id: record.profile_id,
      training_type: record.training_type,
      course_name: record.course_name,
      provider: record.provider ?? '',
      completed_date: record.completed_date ?? '',
      expiry_date: record.expiry_date ?? '',
      certificate_url: record.certificate_url ?? '',
      certificate_pathname: record.certificate_pathname ?? '',
      certificate_name: record.certificate_name ?? '',
    })
    setFormError(null)
    setDialogOpen(true)
  }

  const handleSave = async () => {
    setSaving(true)
    setFormError(null)
    const result = await saveTrainingRecord({
      id: form.id,
      profile_id: form.profile_id,
      training_type: form.training_type,
      course_name: form.course_name,
      provider: form.provider || null,
      completed_date: form.completed_date || null,
      expiry_date: form.expiry_date || null,
      certificate_url: form.certificate_url || null,
      certificate_pathname: form.certificate_pathname || null,
      certificate_name: form.certificate_name || null,
    })
    setSaving(false)
    if (!result.ok) {
      setFormError(result.error ?? 'Could not save record')
      return
    }
    toast.success(form.id ? 'Training record updated' : 'Training record added')
    setDialogOpen(false)
    router.refresh()
  }

  // Uploads a certificate file to private Blob storage, then stores the
  // returned pathname/url on the form so it saves with the record.
  const handleCertUpload = async (file: File) => {
    setUploading(true)
    setFormError(null)
    try {
      const body = new FormData()
      body.append('file', file)
      const res = await fetch('/api/training/certificate/upload', { method: 'POST', body })
      const data = await res.json()
      if (!res.ok) {
        setFormError(data.error ?? 'Upload failed')
        return
      }
      setForm((f) => ({
        ...f,
        certificate_pathname: data.pathname,
        certificate_url: data.url,
        certificate_name: data.name,
      }))
      toast.success('Certificate uploaded')
    } catch {
      setFormError('Upload failed')
    } finally {
      setUploading(false)
    }
  }

  const clearCertificate = () => {
    setForm((f) => ({ ...f, certificate_pathname: '', certificate_url: '', certificate_name: '' }))
  }

  const handleDelete = async () => {
    if (!deleteId) return
    const result = await deleteTrainingRecord(deleteId)
    if (!result.ok) {
      toast.error(result.error ?? 'Could not delete record')
      return
    }
    toast.success('Training record deleted')
    setDeleteId(null)
    router.refresh()
  }

  // Builds an anonymised, client-facing training summary and opens it in a new
  // window for printing / save-as-PDF. Only the employee number, role and
  // department are shown — never names — so it is safe to share with clients.
  const exportAnonymised = () => {
    const rowsHtml = filtered
      .map((r) => {
        const profile = r.profile ?? userById.get(r.profile_id) ?? null
        const dept = profile?.department_id ? deptById.get(profile.department_id)?.name : ''
        const role = profile?.role ? ROLE_LABELS[profile.role] ?? profile.role : ''
        const status = STATUS_BADGE[statusOf(r.expiry_date)].label
        const cert = r.certificate_pathname ? 'On file' : r.certificate_url ? 'Linked' : '—'
        return `<tr>
          <td>${escapeHtml(profile?.employee_number ?? '—')}</td>
          <td>${escapeHtml(role)}</td>
          <td>${escapeHtml(dept ?? '')}</td>
          <td>${escapeHtml(r.training_type)}</td>
          <td>${escapeHtml(r.course_name)}</td>
          <td>${escapeHtml(r.provider ?? '')}</td>
          <td>${escapeHtml(formatDate(r.completed_date))}</td>
          <td>${escapeHtml(formatDate(r.expiry_date))}</td>
          <td>${escapeHtml(status)}</td>
          <td>${escapeHtml(cert)}</td>
        </tr>`
      })
      .join('')

    const html = `<!doctype html><html><head><meta charset="utf-8" />
      <title>Training Summary</title>
      <style>
        * { font-family: Arial, Helvetica, sans-serif; }
        body { margin: 32px; color: #111; }
        h1 { font-size: 20px; margin: 0 0 4px; }
        p.meta { color: #555; font-size: 12px; margin: 0 0 20px; }
        table { width: 100%; border-collapse: collapse; font-size: 11px; }
        th, td { border: 1px solid #ccc; padding: 6px 8px; text-align: left; vertical-align: top; }
        th { background: #f3f4f6; text-transform: uppercase; font-size: 10px; letter-spacing: .04em; }
        tfoot td { border: none; padding-top: 16px; color: #777; font-size: 10px; }
      </style></head><body>
      <h1>Training Summary</h1>
      <p class="meta">Anonymised report — employees are identified by number only. Generated ${new Date().toLocaleDateString('en-GB')}. ${filtered.length} record${filtered.length === 1 ? '' : 's'}.</p>
      <table>
        <thead><tr>
          <th>Employee No.</th><th>Role</th><th>Department</th><th>Training Type</th>
          <th>Course</th><th>Provider</th><th>Completed</th><th>Expiry</th><th>Status</th><th>Certificate</th>
        </tr></thead>
        <tbody>${rowsHtml || '<tr><td colspan="10">No records match the current filters.</td></tr>'}</tbody>
        <tfoot><tr><td colspan="10">This document intentionally excludes employee names for data protection.</td></tr></tfoot>
      </table>
      <script>window.onload = function () { window.print(); }</script>
      </body></html>`

    const win = window.open('', '_blank')
    if (!win) {
      toast.error('Please allow pop-ups to export the training summary')
      return
    }
    win.document.write(html)
    win.document.close()
  }

  const selectableUsers = users.filter((u) => u.role !== 'client')

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 pt-6">
          <div className="relative min-w-[220px] flex-1">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search employee, course, provider..."
              className="pl-8"
            />
          </div>
          <div className="w-44">
            <Select value={deptFilter} onValueChange={setDeptFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Department" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All departments</SelectItem>
                {departments.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="w-44">
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Training type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All types</SelectItem>
                {trainingTypes.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="w-40">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All statuses</SelectItem>
                <SelectItem value="valid">Valid</SelectItem>
                <SelectItem value="expiring">Expiring soon</SelectItem>
                <SelectItem value="expired">Expired</SelectItem>
                <SelectItem value="none">No expiry</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <ImportTrainingDialog />
            <Button variant="outline" size="sm" onClick={exportAnonymised}>
              <FileDown className="mr-2 h-4 w-4" />
              Export PDF
            </Button>
            <Button size="sm" onClick={openAdd}>
              <Plus className="mr-2 h-4 w-4" />
              Add record
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead>Emp No.</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Training Type</TableHead>
                <TableHead>Course</TableHead>
                <TableHead>Provider</TableHead>
                <TableHead>Completed</TableHead>
                <TableHead>Expiry</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Certificate</TableHead>
                <TableHead className="w-24 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={11} className="py-10 text-center text-muted-foreground">
                    <GraduationCap className="mx-auto mb-2 h-8 w-8 opacity-40" />
                    No training records match your filters.
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((r) => {
                  const profile = r.profile ?? userById.get(r.profile_id) ?? null
                  const dept = profile?.department_id ? deptById.get(profile.department_id)?.name : null
                  const status = statusOf(r.expiry_date)
                  const badge = STATUS_BADGE[status]
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{profile?.full_name || 'Unknown'}</TableCell>
                      <TableCell>{profile?.employee_number || '-'}</TableCell>
                      <TableCell>{dept || '-'}</TableCell>
                      <TableCell>{r.training_type}</TableCell>
                      <TableCell>{r.course_name}</TableCell>
                      <TableCell>{r.provider || '-'}</TableCell>
                      <TableCell>{formatDate(r.completed_date)}</TableCell>
                      <TableCell>{formatDate(r.expiry_date)}</TableCell>
                      <TableCell>
                        <Badge className={badge.className}>{badge.label}</Badge>
                      </TableCell>
                      <TableCell>
                        {certHref(r) ? (
                          <a
                            href={certHref(r)!}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                          >
                            <Paperclip className="h-3.5 w-3.5" />
                            {r.certificate_pathname ? 'View' : 'Link'}
                          </a>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" onClick={() => openEdit(r)}>
                            <Pencil className="h-4 w-4" />
                            <span className="sr-only">Edit</span>
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => setDeleteId(r.id)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                            <span className="sr-only">Delete</span>
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{form.id ? 'Edit training record' : 'Add training record'}</DialogTitle>
            <DialogDescription>
              Record a course or qualification for an employee.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="tr-employee">Employee</Label>
              <Select
                value={form.profile_id}
                onValueChange={(value) => setForm({ ...form, profile_id: value })}
              >
                <SelectTrigger id="tr-employee">
                  <SelectValue placeholder="Select employee" />
                </SelectTrigger>
                <SelectContent>
                  {selectableUsers.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.full_name || u.email}
                      {u.employee_number ? ` (${u.employee_number})` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="tr-type">Training type</Label>
                <Input
                  id="tr-type"
                  value={form.training_type}
                  onChange={(e) => setForm({ ...form, training_type: e.target.value })}
                  placeholder="e.g. Fire Safety"
                  list="training-types"
                />
                <datalist id="training-types">
                  {trainingTypes.map((t) => (
                    <option key={t} value={t} />
                  ))}
                </datalist>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tr-course">Course name</Label>
                <Input
                  id="tr-course"
                  value={form.course_name}
                  onChange={(e) => setForm({ ...form, course_name: e.target.value })}
                  placeholder="e.g. Fire Marshal Training"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tr-provider">Provider</Label>
              <Input
                id="tr-provider"
                value={form.provider}
                onChange={(e) => setForm({ ...form, provider: e.target.value })}
                placeholder="e.g. BAFE (optional)"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="tr-completed">Completed date</Label>
                <Input
                  id="tr-completed"
                  type="date"
                  value={form.completed_date}
                  onChange={(e) => setForm({ ...form, completed_date: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tr-expiry">Expiry date</Label>
                <Input
                  id="tr-expiry"
                  type="date"
                  value={form.expiry_date}
                  onChange={(e) => setForm({ ...form, expiry_date: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-2 rounded-md border p-3">
              <Label>Certificate</Label>
              {form.certificate_pathname || form.certificate_url ? (
                <div className="flex items-center justify-between gap-2 rounded-md bg-muted/50 px-3 py-2">
                  <span className="flex min-w-0 items-center gap-2 text-sm">
                    <Paperclip className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="truncate">
                      {form.certificate_name ||
                        (form.certificate_pathname ? 'Uploaded certificate' : form.certificate_url)}
                    </span>
                  </span>
                  <Button type="button" variant="ghost" size="icon" onClick={clearCertificate}>
                    <X className="h-4 w-4" />
                    <span className="sr-only">Remove certificate</span>
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={uploading}
                      onClick={() => certFileRef.current?.click()}
                    >
                      {uploading ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Upload className="mr-2 h-4 w-4" />
                      )}
                      Upload file
                    </Button>
                    <input
                      ref={certFileRef}
                      type="file"
                      accept=".pdf,.png,.jpg,.jpeg,.webp,image/*,application/pdf"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0]
                        if (file) handleCertUpload(file)
                        e.target.value = ''
                      }}
                    />
                    <span className="text-xs text-muted-foreground">or paste a link below</span>
                  </div>
                  <Input
                    value={form.certificate_url}
                    onChange={(e) =>
                      setForm({ ...form, certificate_url: e.target.value, certificate_pathname: '' })
                    }
                    placeholder="https://link-to-certificate"
                  />
                </div>
              )}
            </div>
            {formError && <p className="text-sm text-destructive">{formError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {form.id ? 'Save changes' : 'Add record'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete training record?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the training record. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

// Minimal HTML escaper for the print export (values come from the DB / CSV).
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
