'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Plus, Paperclip, Loader2, FileText } from 'lucide-react'
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

// Phase-1 manual entry: drag in a .eml/.msg email (or paste one) so it's triaged
// immediately. Once the inbound address is live (Phase 2) most requests arrive
// automatically, but drag-and-drop remains the quickest way to file one by hand.
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

  // A parent dropped a file onto the page — open and parse it.
  useEffect(() => {
    if (fileToLoad) {
      setOpen(true)
      void loadFile(fileToLoad)
      onFileConsumed?.()
    }
  }, [fileToLoad, loadFile, onFileConsumed])

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
      resetFields()
      setOpen(false)
      router.refresh()
    } finally {
      setSaving(false)
    }
  }

  // Feature temporarily hidden everywhere: the manual "Add request" flow was
  // mis-triaging and creating unintended calls. Returning null after all hooks
  // keeps the Rules of Hooks intact while removing every entry point. Restore by
  // deleting this early return once the triage flow is fixed.
  return null

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
            Drag in an email file, or paste its content. AI reads the sender and content, matches it
            to a site, and suggests an action for you to approve.
          </DialogDescription>
        </DialogHeader>

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
          <Button onClick={handleSubmit} disabled={saving || parsing}>
            {saving ? 'Adding…' : 'Add & triage'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
