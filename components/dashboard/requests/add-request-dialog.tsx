'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Plus, Paperclip, Loader2, FileText, Upload, X } from 'lucide-react'
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
import { addManualRequest } from '@/lib/actions/inbound-requests'
import { parseEmailFile } from '@/lib/email/parse-email-file'
import type { InboundAttachment } from '@/lib/types/database'

const DOC_ACCEPT = '.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,image/*'

// Manual entry: a staff member types a client request by hand (or imports a
// forwarded .eml/.msg) and attaches any supporting documents (photos, PDFs,
// spreadsheets). It's triaged immediately so a suggested action appears.
export function AddRequestDialog({
  fileToLoad,
  onFileConsumed,
  triggerVariant = 'default',
}: {
  // When set by a parent (e.g. a page-level drop), the dialog opens and parses it.
  fileToLoad?: File | null
  onFileConsumed?: () => void
  // Lets list/dashboard headers render this as a secondary (outline) action so it
  // doesn't compete with an existing primary button.
  triggerVariant?: 'default' | 'outline'
} = {}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [parsing, setParsing] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [loadedFileName, setLoadedFileName] = useState<string | null>(null)
  const [fromName, setFromName] = useState('')
  const [fromEmail, setFromEmail] = useState('')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [attachments, setAttachments] = useState<InboundAttachment[]>([])
  const emailInputRef = useRef<HTMLInputElement>(null)
  const docInputRef = useRef<HTMLInputElement>(null)

  const resetFields = useCallback(() => {
    setFromName('')
    setFromEmail('')
    setSubject('')
    setBody('')
    setLoadedFileName(null)
    setAttachments([])
  }, [])

  const loadEmailFile = useCallback(async (file: File) => {
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

  // A parent dropped an email file onto the page — open and parse it.
  useEffect(() => {
    if (fileToLoad) {
      setOpen(true)
      void loadEmailFile(fileToLoad)
      onFileConsumed?.()
    }
  }, [fileToLoad, loadEmailFile, onFileConsumed])

  function handleEmailDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (file) void loadEmailFile(file)
  }

  // Upload supporting documents to private Blob and keep their references.
  const uploadDocs = useCallback(async (files: File[]) => {
    if (files.length === 0) return
    setUploading(true)
    try {
      for (const file of files) {
        const form = new FormData()
        form.append('file', file)
        const res = await fetch('/api/requests/upload', { method: 'POST', body: form })
        const json = await res.json().catch(() => null)
        if (!res.ok || !json?.attachment) {
          toast.error(json?.error ?? `Could not upload "${file.name}".`)
          continue
        }
        setAttachments((prev) => [...prev, json.attachment as InboundAttachment])
      }
    } finally {
      setUploading(false)
    }
  }, [])

  function removeAttachment(pathname: string) {
    setAttachments((prev) => prev.filter((a) => a.pathname !== pathname))
  }

  async function handleSubmit() {
    if (!body.trim()) {
      toast.error('Enter the request details first.')
      return
    }
    setSaving(true)
    try {
      const res = await addManualRequest({
        fromName: fromName.trim() || undefined,
        fromEmail: fromEmail.trim() || undefined,
        subject: subject.trim() || undefined,
        body,
        attachments,
      })
      if (!res.ok) {
        toast.error(res.error ?? 'Could not add the request.')
        return
      }
      toast.success('Request added and triaged.')
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
        <Button variant={triggerVariant}>
          <Plus className="h-4 w-4" />
          Add request
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add a request</DialogTitle>
          <DialogDescription className="text-pretty">
            Log a client request by hand and attach any supporting documents. AI reads it, matches it
            to a site, and suggests an action for you to approve.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          {/* Manual entry fields */}
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
            <Label htmlFor="body">Request details *</Label>
            <Textarea
              id="body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={8}
              placeholder="Describe what the client needs — the fault, site, urgency, any reference numbers…"
            />
          </div>

          {/* Supporting documents */}
          <div className="grid gap-2">
            <Label>Supporting documents (optional)</Label>
            <button
              type="button"
              onClick={() => docInputRef.current?.click()}
              className="flex flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed border-border p-5 text-center transition-colors hover:bg-muted/50"
              aria-label="Attach supporting documents"
            >
              {uploading ? (
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              ) : (
                <Upload className="h-6 w-6 text-muted-foreground" />
              )}
              <span className="text-sm font-medium">
                {uploading ? 'Uploading…' : 'Attach photos, PDFs or spreadsheets'}
              </span>
              <span className="text-xs text-muted-foreground">
                PDF, Word, Excel, CSV, text or images — up to 25MB each
              </span>
              <input
                ref={docInputRef}
                type="file"
                accept={DOC_ACCEPT}
                multiple
                className="sr-only"
                onChange={(e) => {
                  const files = Array.from(e.target.files ?? [])
                  if (files.length) void uploadDocs(files)
                  e.target.value = ''
                }}
              />
            </button>

            {attachments.length > 0 && (
              <ul className="grid gap-1.5">
                {attachments.map((a) => (
                  <li
                    key={a.pathname}
                    className="flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-sm"
                  >
                    <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate">{a.name}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 shrink-0"
                      onClick={() => removeAttachment(a.pathname)}
                      aria-label={`Remove ${a.name}`}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Optional: import a forwarded email file instead of typing */}
          <div className="grid gap-2">
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center">
                <span className="bg-background px-2 text-xs text-muted-foreground">
                  or import a forwarded email
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => emailInputRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault()
                setDragOver(true)
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleEmailDrop}
              className={cn(
                'flex flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed p-4 text-center transition-colors',
                dragOver ? 'border-primary bg-primary/[0.04]' : 'border-border hover:bg-muted/50',
              )}
              aria-label="Drop an email file here or click to browse"
            >
              {parsing ? (
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              ) : loadedFileName ? (
                <FileText className="h-5 w-5 text-primary" />
              ) : (
                <Paperclip className="h-5 w-5 text-muted-foreground" />
              )}
              <span className="text-sm font-medium">
                {parsing
                  ? 'Reading email…'
                  : loadedFileName
                    ? `Loaded ${loadedFileName} — fields filled in above`
                    : 'Drop a .eml / .msg here to fill in the fields'}
              </span>
              <input
                ref={emailInputRef}
                type="file"
                accept=".eml,.msg,message/rfc822,application/vnd.ms-outlook"
                className="sr-only"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) void loadEmailFile(file)
                  e.target.value = ''
                }}
              />
            </button>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={saving || parsing || uploading}>
            {saving ? 'Adding…' : 'Add & triage'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
