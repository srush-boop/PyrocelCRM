'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Send, Loader2, Plus, X, Users, Mail } from 'lucide-react'
import { toast } from 'sonner'
import { distributeRams } from '@/lib/rams/distribution-actions'

interface EngineerOption {
  id: string
  full_name: string | null
  email: string | null
  role: string
}

interface DistributeRamsDialogProps {
  ramsId: string
  engineers: EngineerOption[]
  currentUserId: string
  defaultClientEmail?: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

export function DistributeRamsDialog({
  ramsId,
  engineers,
  currentUserId,
  defaultClientEmail,
  open,
  onOpenChange,
}: DistributeRamsDialogProps) {
  const [busy, setBusy] = useState(false)
  const [selectedEngineers, setSelectedEngineers] = useState<string[]>([])
  const [clientEmails, setClientEmails] = useState<string[]>(
    defaultClientEmail && isValidEmail(defaultClientEmail)
      ? [defaultClientEmail]
      : [],
  )
  const [emailInput, setEmailInput] = useState('')
  const [message, setMessage] = useState('')

  function toggleEngineer(id: string) {
    setSelectedEngineers((prev) =>
      prev.includes(id) ? prev.filter((e) => e !== id) : [...prev, id],
    )
  }

  function addClientEmail() {
    const v = emailInput.trim().toLowerCase()
    if (!v) return
    if (!isValidEmail(v)) {
      toast.error('Enter a valid email address')
      return
    }
    if (!clientEmails.includes(v)) setClientEmails((prev) => [...prev, v])
    setEmailInput('')
  }

  async function handleDistribute() {
    if (selectedEngineers.length === 0 && clientEmails.length === 0) {
      toast.error('Select at least one engineer or add a client email')
      return
    }
    setBusy(true)
    const res = await distributeRams(ramsId, {
      engineerIds: selectedEngineers,
      clientRecipients: clientEmails.map((email) => ({ email, name: null })),
      message: message.trim() || null,
    })
    setBusy(false)

    if (!res.success) {
      toast.error(res.error)
      return
    }
    const summary = res.data ?? {
      engineersAssigned: 0,
      clientsInvited: 0,
      emailsSent: 0,
      emailsFailed: 0,
      emailUnavailable: false,
    }
    toast.success(
      `Distributed to ${summary.engineersAssigned} engineer(s) and ${summary.clientsInvited} client(s).` +
        (summary.emailUnavailable
          ? ' Email delivery is not configured, so links were recorded but not emailed.'
          : ''),
    )
    setSelectedEngineers([])
    setClientEmails([])
    setMessage('')
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Distribute RAMS</DialogTitle>
          <DialogDescription>
            Send this RAMS to engineers for read &amp; confirm, and to clients to
            acknowledge receipt.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Engineers */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2 text-sm font-medium">
              <Users className="h-4 w-4" />
              Engineers (read &amp; confirm)
            </Label>
            <div className="max-h-48 space-y-1 overflow-y-auto rounded-md border p-2">
              {engineers.length === 0 && (
                <p className="p-2 text-sm text-muted-foreground">
                  No staff available to assign.
                </p>
              )}
              {engineers.map((eng) => {
                const checked = selectedEngineers.includes(eng.id)
                return (
                  <label
                    key={eng.id}
                    className="flex cursor-pointer items-center gap-3 rounded-md p-2 hover:bg-muted"
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={() => toggleEngineer(eng.id)}
                    />
                    <span className="flex-1 text-sm">
                      {eng.full_name || eng.email || 'Unnamed'}
                      {eng.id === currentUserId && (
                        <span className="ml-1 text-xs text-muted-foreground">
                          (you)
                        </span>
                      )}
                    </span>
                    <Badge variant="outline" className="text-xs capitalize">
                      {eng.role}
                    </Badge>
                  </label>
                )
              })}
            </div>
          </div>

          {/* Client recipients */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2 text-sm font-medium">
              <Mail className="h-4 w-4" />
              Client recipients (acknowledge receipt)
            </Label>
            <div className="flex gap-2">
              <Input
                type="email"
                inputMode="email"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                    e.preventDefault()
                    addClientEmail()
                  }
                }}
                placeholder="client@example.com"
              />
              <Button type="button" variant="outline" onClick={addClientEmail}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            {clientEmails.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {clientEmails.map((email) => (
                  <Badge
                    key={email}
                    variant="secondary"
                    className="cursor-pointer"
                    onClick={() =>
                      setClientEmails((prev) => prev.filter((e) => e !== email))
                    }
                  >
                    {email}
                    <X className="ml-1 h-3 w-3" />
                  </Badge>
                ))}
              </div>
            )}
          </div>

          {/* Message */}
          <div className="space-y-2">
            <Label htmlFor="dist-message" className="text-sm font-medium">
              Message (optional)
            </Label>
            <Textarea
              id="dist-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Add a short note included in the notification email."
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={busy}
          >
            Cancel
          </Button>
          <Button onClick={handleDistribute} disabled={busy}>
            {busy ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Send className="mr-2 h-4 w-4" />
            )}
            Distribute
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
