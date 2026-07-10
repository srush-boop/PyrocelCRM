'use client'

import { useCallback, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Plus, Paperclip, Loader2, FileText, Link2 } from 'lucide-react'
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
import { cn } from '@/lib/utils'
import {
  addContextualRequest,
  type RequestEntityType,
} from '@/lib/actions/inbound-requests'
import { parseEmailFile } from '@/lib/email/parse-email-file'

export interface AddRequestButtonProps {
  entityType: RequestEntityType
  entityId: string
  /** Known context from the entity — locks the AI match instead of guessing. */
  context?: {
    siteId?: string | null
    clientId?: string | null
    serviceTypeId?: string | null
    /** Human label shown in the dialog + fed to the model, e.g. "Quote Q-1042 · Acme HQ". */
    label?: string | null
  }
  /** Entity page path to revalidate so the linked-requests card refreshes. */
  revalidate?: string
  /** Button appearance overrides for different page headers. */
  variant?: 'default' | 'outline' | 'secondary' | 'ghost'
  size?: 'default' | 'sm' | 'lg' | 'icon'
  buttonLabel?: string
  className?: string
}

/**
 * Contextual "Add request" button for entity pages (quote, job, site, call,
 * defect). Files a client request that is hard-linked to the current record and
 * AI-triaged anchored to its site/client, then shows in both the central Requests
 * inbox and on the entity's own linked-requests card.
 */
export function AddRequestButton({
  entityType,
  entityId,
  context,
  revalidate,
  variant = 'outline',
  size = 'sm',
  buttonLabel = 'Add request',
  className,
}: AddRequestButtonProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [parsing, setParsing] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [loadedFileName, setLoadedFileName] = useState<string | null>(null)
  const [fromName, setFromName] = useState('')
  const [fromEmail, setFromEmail] = useState('')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const resetFields = useCallback(() => {
    setFromName('')
    setFromEmail('')
    setSubject('')
    setBody('')
    setLoadedFileName(null)
  }, [])

  const loadFile = useCallback(async (file: File) => {
    setParsing(true)
    try {
      const parsed = await parseEmailFile(file)
      setFromName(parsed.fromName ?? '')
      setFromEmail(parsed.fromEmail ?? '')
      setSubject(parsed.subject ?? '')
      setBody(parsed.body)
      setLoadedFileName(file.name)
      toast.success(`Loaded "${file.name}". Review and triage.`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not read that email file.')
    } finally {
      setParsing(false)
    }
  }, [])

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (file) void loadFile(file)
  }

  async function handleSubmit() {
    if (!body.trim()) {
      toast.error('Drop an email or paste its content first.')
      return
    }
    setSaving(true)
    try {
      const res = await addContextualRequest({
        entityType,
        entityId,
        context,
        revalidate,
        fromName: fromName.trim() || undefined,
        fromEmail: fromEmail.trim() || undefined,
        subject: subject.trim() || undefined,
        body,
      })
      if (!res.ok) {
        toast.error(res.error ?? 'Could not add the request.')
        return
      }
      toast.success('Request added, linked and triaged.')
      resetFields()
      setOpen(false)
      router.refresh()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v)
        if (!v) resetFields()
      }}
    >
      <DialogTrigger asChild>
        <Button variant={variant} size={size} className={className}>
          <Plus className="h-4 w-4" />
          {buttonLabel}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add a request</DialogTitle>
          <DialogDescription className="text-pretty">
            Drag in an email file, or paste its content. AI reads it and drafts a suggested action
            for you to approve.
          </DialogDescription>
        </DialogHeader>

        {context?.label && (
          <div className="flex items-center gap-2 rounded-md border border-primary/30 bg-primary/[0.04] px-3 py-2 text-sm">
            <Link2 className="h-4 w-4 shrink-0 text-primary" />
            <span className="text-pretty">
              This request will be linked to <span className="font-medium">{context.label}</span>.
            </span>
          </div>
        )}

        <div className="grid gap-4 py-2">
          {/* Drop zone */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault()
              setDragOver(true)
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            className={cn(
              'flex flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed p-6 text-center transition-colors',
              dragOver ? 'border-primary bg-primary/[0.04]' : 'border-border hover:bg-muted/50',
            )}
            aria-label="Drop an email file here or click to browse"
          >
            {parsing ? (
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            ) : loadedFileName ? (
              <FileText className="h-6 w-6 text-primary" />
            ) : (
              <Paperclip className="h-6 w-6 text-muted-foreground" />
            )}
            <span className="text-sm font-medium">
              {parsing
                ? 'Reading email…'
                : loadedFileName
                  ? loadedFileName
                  : 'Drag an email here, or click to browse'}
            </span>
            <span className="text-xs text-muted-foreground">
              Supports .eml (Apple Mail, Thunderbird) and .msg (Outlook)
            </span>
            <input
              ref={fileInputRef}
              type="file"
              accept=".eml,.msg,message/rfc822,application/vnd.ms-outlook"
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) void loadFile(file)
                e.target.value = ''
              }}
            />
          </button>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center">
              <span className="bg-background px-2 text-xs text-muted-foreground">or enter manually</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label htmlFor="ctx-from-name">Sender name</Label>
              <Input
                id="ctx-from-name"
                value={fromName}
                onChange={(e) => setFromName(e.target.value)}
                placeholder="e.g. Jane Smith"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="ctx-from-email">Sender email</Label>
              <Input
                id="ctx-from-email"
                type="email"
                value={fromEmail}
                onChange={(e) => setFromEmail(e.target.value)}
                placeholder="jane@client.com"
              />
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="ctx-subject">Subject</Label>
            <Input
              id="ctx-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="e.g. Fire alarm fault at Acme HQ"
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="ctx-body">Email content *</Label>
            <Textarea
              id="ctx-body"
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
          <Button onClick={handleSubmit} disabled={saving || parsing}>
            {saving ? 'Adding…' : 'Add & triage'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
