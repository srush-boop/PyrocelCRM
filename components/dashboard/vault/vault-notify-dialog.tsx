'use client'

import { useMemo, useState } from 'react'
import { Send } from 'lucide-react'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { ScrollArea } from '@/components/ui/scroll-area'
import { sendVaultUpdate, type VaultUpdateAudience } from '@/lib/actions/vault'

export interface VaultDepartment {
  id: string
  name: string
}
export interface VaultStaff {
  id: string
  full_name: string | null
  role: string
  department_id: string | null
}

interface VaultNotifyDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  departments: VaultDepartment[]
  staff: VaultStaff[]
  /** Optional context appended to the default message + deep link. */
  contextLabel?: string | null
  url?: string | null
}

const DEFAULT_TITLE = 'Employee Vault updated'
const defaultMessage = (context?: string | null) =>
  context
    ? `"${context}" in the Employee Vault has been updated. Please take a moment to review it.`
    : 'A document in the Employee Vault has been updated. Please take a moment to review it.'

export function VaultNotifyDialog({
  open,
  onOpenChange,
  departments,
  staff,
  contextLabel,
  url,
}: VaultNotifyDialogProps) {
  const [audience, setAudience] = useState<VaultUpdateAudience>('all')
  const [deptIds, setDeptIds] = useState<string[]>([])
  const [userIds, setUserIds] = useState<string[]>([])
  const [staffFilter, setStaffFilter] = useState('')
  const [title, setTitle] = useState(DEFAULT_TITLE)
  const [message, setMessage] = useState(defaultMessage(contextLabel))
  const [sending, setSending] = useState(false)

  const filteredStaff = useMemo(() => {
    const q = staffFilter.trim().toLowerCase()
    if (!q) return staff
    return staff.filter((s) => (s.full_name ?? '').toLowerCase().includes(q))
  }, [staff, staffFilter])

  function toggle(list: string[], id: string): string[] {
    return list.includes(id) ? list.filter((x) => x !== id) : [...list, id]
  }

  async function handleSend() {
    if (!title.trim()) {
      toast.error('Please enter a title')
      return
    }
    if (message.trim().length < 3) {
      toast.error('Please enter a message')
      return
    }
    setSending(true)
    const res = await sendVaultUpdate({
      audience,
      departmentIds: deptIds,
      userIds,
      title,
      message,
      url: url ?? '/dashboard/vault',
    })
    setSending(false)
    if (!res.ok) {
      toast.error(res.error ?? 'Could not send the update')
      return
    }
    toast.success(
      `Update sent to ${res.recipients} ${res.recipients === 1 ? 'person' : 'people'}`,
    )
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Send a vault update</DialogTitle>
          <DialogDescription>
            Notify staff that vault documentation has changed. The message is editable.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="vault-notify-title">Title</Label>
            <Input
              id="vault-notify-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={120}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="vault-notify-message">Message</Label>
            <Textarea
              id="vault-notify-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
            />
          </div>

          <div className="space-y-2">
            <Label>Send to</Label>
            <RadioGroup
              value={audience}
              onValueChange={(v) => setAudience(v as VaultUpdateAudience)}
              className="gap-2"
            >
              <div className="flex items-center gap-2">
                <RadioGroupItem value="all" id="aud-all" />
                <Label htmlFor="aud-all" className="font-normal">
                  Everyone (all staff)
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="departments" id="aud-dept" />
                <Label htmlFor="aud-dept" className="font-normal">
                  Selected departments
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="staff" id="aud-staff" />
                <Label htmlFor="aud-staff" className="font-normal">
                  Selected people
                </Label>
              </div>
            </RadioGroup>
          </div>

          {audience === 'departments' && (
            <div className="space-y-2 rounded-md border p-3">
              {departments.length === 0 ? (
                <p className="text-sm text-muted-foreground">No departments found.</p>
              ) : (
                departments.map((d) => (
                  <label key={d.id} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={deptIds.includes(d.id)}
                      onCheckedChange={() => setDeptIds((prev) => toggle(prev, d.id))}
                    />
                    {d.name}
                  </label>
                ))
              )}
            </div>
          )}

          {audience === 'staff' && (
            <div className="space-y-2 rounded-md border p-3">
              <Input
                placeholder="Search people..."
                value={staffFilter}
                onChange={(e) => setStaffFilter(e.target.value)}
                className="h-8"
              />
              <ScrollArea className="h-48">
                <div className="space-y-2 pr-3">
                  {filteredStaff.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No matching people.</p>
                  ) : (
                    filteredStaff.map((s) => (
                      <label key={s.id} className="flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={userIds.includes(s.id)}
                          onCheckedChange={() => setUserIds((prev) => toggle(prev, s.id))}
                        />
                        <span className="min-w-0 truncate">
                          {s.full_name ?? 'Unnamed'}
                          <span className="ml-1 text-xs capitalize text-muted-foreground">
                            {s.role}
                          </span>
                        </span>
                      </label>
                    ))
                  )}
                </div>
              </ScrollArea>
              {userIds.length > 0 && (
                <p className="text-xs text-muted-foreground">{userIds.length} selected</p>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={sending}>
            Cancel
          </Button>
          <Button onClick={handleSend} disabled={sending}>
            <Send className="mr-2 h-4 w-4" />
            {sending ? 'Sending...' : 'Send update'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
