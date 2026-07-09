'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Plus } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { addManualRequest } from '@/lib/actions/inbound-requests'

// Phase-1 manual entry: paste a forwarded email in so it's triaged immediately.
// Once the inbound address is live (Phase 2), most requests arrive automatically.
export function AddRequestDialog() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [fromName, setFromName] = useState('')
  const [fromEmail, setFromEmail] = useState('')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')

  async function handleSubmit() {
    if (!body.trim()) {
      toast.error('Paste the email content.')
      return
    }
    setSaving(true)
    try {
      const res = await addManualRequest({
        fromName: fromName.trim() || undefined,
        fromEmail: fromEmail.trim() || undefined,
        subject: subject.trim() || undefined,
        body,
      })
      if (!res.ok) {
        toast.error(res.error ?? 'Could not add the request.')
        return
      }
      toast.success('Request added and triaged.')
      setFromName('')
      setFromEmail('')
      setSubject('')
      setBody('')
      setOpen(false)
      router.refresh()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4" />
          Add request
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add a request</DialogTitle>
          <DialogDescription className="text-pretty">
            Paste a forwarded email. AI reads the sender and content, matches it to a site, and
            suggests an action for you to approve.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label htmlFor="from-name">Sender name</Label>
              <Input
                id="from-name"
                value={fromName}
                onChange={(e) => setFromName(e.target.value)}
                placeholder="e.g. Jane Smith"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="from-email">Sender email</Label>
              <Input
                id="from-email"
                type="email"
                value={fromEmail}
                onChange={(e) => setFromEmail(e.target.value)}
                placeholder="jane@client.com"
              />
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="subject">Subject</Label>
            <Input
              id="subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="e.g. Fire alarm fault at Acme HQ"
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="body">Email content *</Label>
            <Textarea
              id="body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={10}
              placeholder="Paste the full email here…"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving ? 'Adding…' : 'Add & triage'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
