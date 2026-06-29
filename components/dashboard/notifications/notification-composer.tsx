'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { Send, Users } from 'lucide-react'
import { toast } from 'sonner'
import { sendAdminNotification } from '@/app/(dashboard)/dashboard/notifications/actions'

interface StaffMember {
  id: string
  full_name: string | null
  email: string
  role: string
}

const ROLE_GROUPS = [
  { value: 'engineer', label: 'All engineers' },
  { value: 'office', label: 'All office' },
  { value: 'admin', label: 'All admins' },
]

export function NotificationComposer({ staff }: { staff: StaffMember[] }) {
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [url, setUrl] = useState('')
  const [roles, setRoles] = useState<string[]>([])
  const [userIds, setUserIds] = useState<string[]>([])
  const [showUserPicker, setShowUserPicker] = useState(false)
  const [sending, setSending] = useState(false)

  function toggleRole(role: string) {
    setRoles((prev) => (prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]))
  }

  function toggleUser(id: string) {
    setUserIds((prev) => (prev.includes(id) ? prev.filter((u) => u !== id) : [...prev, id]))
  }

  async function handleSend() {
    if (!title.trim()) {
      toast.error('Please enter a title.')
      return
    }
    if (roles.length === 0 && userIds.length === 0) {
      toast.error('Select at least one recipient group or user.')
      return
    }
    setSending(true)
    const res = await sendAdminNotification({ title, body, url: url || undefined, roles, userIds })
    setSending(false)
    if (!res.ok) {
      toast.error(res.error || 'Failed to send notification.')
      return
    }
    toast.success(`Notification sent to ${res.count} ${res.count === 1 ? 'person' : 'people'}.`)
    setTitle('')
    setBody('')
    setUrl('')
    setRoles([])
    setUserIds([])
    setShowUserPicker(false)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Send className="h-4 w-4" />
          Send a notification
        </CardTitle>
        <CardDescription>
          Push an announcement to selected users and/or whole role groups. Recipients see it in the
          app and, if enabled, as a browser notification.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="notif-title">Title</Label>
          <Input
            id="notif-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Office closed Friday afternoon"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="notif-body">Message</Label>
          <Textarea
            id="notif-body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Optional details…"
            rows={3}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="notif-url">
            Link <span className="text-muted-foreground">(optional)</span>
          </Label>
          <Input
            id="notif-url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="/dashboard/schedule"
          />
        </div>

        <div className="space-y-2">
          <Label>Recipient groups</Label>
          <div className="flex flex-wrap gap-2">
            {ROLE_GROUPS.map((g) => (
              <button
                key={g.value}
                type="button"
                onClick={() => toggleRole(g.value)}
                className="focus:outline-none"
              >
                <Badge
                  variant={roles.includes(g.value) ? 'default' : 'outline'}
                  className="cursor-pointer gap-1.5 px-3 py-1.5 text-sm"
                >
                  <Users className="h-3.5 w-3.5" />
                  {g.label}
                </Badge>
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Specific people {userIds.length > 0 && `(${userIds.length})`}</Label>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setShowUserPicker((s) => !s)}
            >
              {showUserPicker ? 'Hide' : 'Choose people'}
            </Button>
          </div>
          {showUserPicker && (
            <div className="max-h-56 space-y-1 overflow-y-auto rounded-md border p-2">
              {staff.map((s) => (
                <label
                  key={s.id}
                  className="flex cursor-pointer items-center gap-3 rounded px-2 py-1.5 hover:bg-muted/60"
                >
                  <Checkbox
                    checked={userIds.includes(s.id)}
                    onCheckedChange={() => toggleUser(s.id)}
                  />
                  <span className="flex-1 text-sm">
                    {s.full_name || s.email}{' '}
                    <span className="text-muted-foreground capitalize">· {s.role}</span>
                  </span>
                </label>
              ))}
            </div>
          )}
        </div>

        <div className="flex justify-end">
          <Button onClick={handleSend} disabled={sending} className="gap-2">
            <Send className="h-4 w-4" />
            {sending ? 'Sending…' : 'Send notification'}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
