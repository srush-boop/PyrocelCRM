'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { FileText, Loader2, Plus, Printer, Mail, Save, ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { DocumentOwnerType, DocumentTemplate } from '@/lib/types/database'
import { getMergeTokenGroups, OWNER_TYPE_LABELS } from '@/lib/documents/merge-tokens'
import {
  getTemplatesForEntity,
  previewDocument,
  createDocument,
} from '@/lib/actions/documents-create'

interface CreateDocumentButtonProps {
  ownerType: DocumentOwnerType
  ownerId: string
  // Human label for the entity, shown in the dialog subtitle.
  entityLabel?: string
  // Path to revalidate after saving so the Documents list refreshes.
  revalidatePath?: string
  variant?: 'default' | 'outline' | 'secondary' | 'ghost'
  size?: 'default' | 'sm'
  className?: string
}

const BLANK = '__blank__'

export function CreateDocumentButton({
  ownerType,
  ownerId,
  entityLabel,
  revalidatePath,
  variant = 'outline',
  size = 'sm',
  className,
}: CreateDocumentButtonProps) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button variant={variant} size={size} className={className} onClick={() => setOpen(true)}>
        <FileText className="mr-2 h-4 w-4" />
        Create document
      </Button>
      {open && (
        <CreateDocumentDialog
          open={open}
          onOpenChange={setOpen}
          ownerType={ownerType}
          ownerId={ownerId}
          entityLabel={entityLabel}
          revalidatePath={revalidatePath}
        />
      )}
    </>
  )
}

interface DialogProps extends CreateDocumentButtonProps {
  open: boolean
  onOpenChange: (v: boolean) => void
}

function CreateDocumentDialog({
  open,
  onOpenChange,
  ownerType,
  ownerId,
  entityLabel,
  revalidatePath,
}: DialogProps) {
  const [templates, setTemplates] = useState<DocumentTemplate[]>([])
  const [loadingTemplates, setLoadingTemplates] = useState(true)
  const [templateId, setTemplateId] = useState<string>(BLANK)
  const [title, setTitle] = useState('')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [preview, setPreview] = useState('')
  const [recipient, setRecipient] = useState('')
  const [cc, setCc] = useState('')
  const [message, setMessage] = useState('')
  const [emailMode, setEmailMode] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [previewing, startPreview] = useTransition()
  const [saving, startSave] = useTransition()
  const bodyRef = useRef<HTMLTextAreaElement>(null)

  const tokenGroups = useMemo(() => getMergeTokenGroups(ownerType), [ownerType])

  // Load templates applicable to this entity.
  useEffect(() => {
    let active = true
    setLoadingTemplates(true)
    getTemplatesForEntity(ownerType)
      .then((rows) => {
        if (!active) return
        setTemplates(rows)
      })
      .finally(() => active && setLoadingTemplates(false))
    return () => {
      active = false
    }
  }, [ownerType])

  // When a template is picked, prefill the editable body/subject/title from it.
  function applyTemplate(id: string) {
    setTemplateId(id)
    setError(null)
    setNotice(null)
    if (id === BLANK) {
      setTitle((t) => t || 'Letter')
      setSubject('')
      setBody('')
      setPreview('')
      return
    }
    const tpl = templates.find((t) => t.id === id)
    if (tpl) {
      setTitle(tpl.name)
      setSubject(tpl.subject ?? '')
      setBody(tpl.body)
    }
  }

  // Refresh the merged preview + recipient whenever the body/subject settles.
  function refreshPreview() {
    startPreview(async () => {
      const res = await previewDocument({
        ownerType,
        ownerId,
        subjectOverride: subject,
        bodyOverride: body,
      })
      if (res.ok && res.data) {
        setPreview(res.data.body)
        if (!recipient && res.data.recipientEmail) setRecipient(res.data.recipientEmail)
      }
    })
  }

  // Debounced live preview as the body/subject change.
  useEffect(() => {
    const id = setTimeout(refreshPreview, 350)
    return () => clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [body, subject, ownerType, ownerId])

  function insertToken(token: string) {
    const el = bodyRef.current
    const snippet = `{{${token}}}`
    if (!el) {
      setBody((b) => b + snippet)
      return
    }
    const start = el.selectionStart ?? body.length
    const end = el.selectionEnd ?? body.length
    const next = body.slice(0, start) + snippet + body.slice(end)
    setBody(next)
    requestAnimationFrame(() => {
      el.focus()
      const pos = start + snippet.length
      el.setSelectionRange(pos, pos)
    })
  }

  function runCreate(action: 'save' | 'email') {
    setError(null)
    setNotice(null)
    startSave(async () => {
      const res = await createDocument({
        ownerType,
        ownerId,
        templateId: templateId === BLANK ? undefined : templateId,
        title,
        body: preview || body,
        action,
        to: recipient.trim() || undefined,
        cc: cc
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
        subject: subject.trim() || title,
        message: message.trim() || undefined,
        revalidate: revalidatePath,
      })
      if (!res.ok) {
        setError(res.error)
        return
      }
      if (action === 'email') {
        setNotice('Document saved and emailed.')
      } else {
        setNotice('Document saved to Documents.')
      }
      // Close shortly after a successful save so the user sees the confirmation.
      setTimeout(() => onOpenChange(false), 900)
    })
  }

  // Open a print window with the merged letter text (browser print/save-as-PDF).
  function handlePrint() {
    const w = window.open('', '_blank')
    if (!w) return
    const safe = (preview || body).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] as string))
    w.document.write(
      `<html><head><title>${title || 'Letter'}</title><style>body{font-family:Arial,Helvetica,sans-serif;line-height:1.5;padding:48px;max-width:700px;margin:auto;color:#0f172a;white-space:pre-wrap}h1{font-size:18px}</style></head><body>${
        title ? `<h1>${title}</h1>` : ''
      }${safe}</body></html>`,
    )
    w.document.close()
    w.focus()
    w.print()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Create document</DialogTitle>
          <DialogDescription>
            {OWNER_TYPE_LABELS[ownerType]}
            {entityLabel ? ` · ${entityLabel}` : ''} — merge details into a template, then save,
            print or email.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 md:grid-cols-2 overflow-y-auto flex-1 pr-1">
          {/* Left: editor */}
          <div className="space-y-3">
            <div className="grid gap-1.5">
              <Label>Template</Label>
              <Select value={templateId} onValueChange={applyTemplate} disabled={loadingTemplates}>
                <SelectTrigger>
                  <SelectValue placeholder={loadingTemplates ? 'Loading…' : 'Choose a template'} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={BLANK}>Blank letter</SelectItem>
                  {templates.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="doc-title">Title</Label>
              <Input
                id="doc-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Acknowledgement of cancellation"
              />
            </div>

            <div className="grid gap-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="doc-body">Body</Label>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs">
                      <Plus className="h-3.5 w-3.5" />
                      Insert field
                      <ChevronDown className="h-3.5 w-3.5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="max-h-72 overflow-y-auto">
                    {tokenGroups.map((group) => (
                      <div key={group.heading}>
                        <DropdownMenuLabel className="text-xs text-muted-foreground">
                          {group.heading}
                        </DropdownMenuLabel>
                        {group.tokens.map((tok) => (
                          <DropdownMenuItem key={tok.token} onSelect={() => insertToken(tok.token)}>
                            {tok.label}
                          </DropdownMenuItem>
                        ))}
                        <DropdownMenuSeparator />
                      </div>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <Textarea
                id="doc-body"
                ref={bodyRef}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={12}
                placeholder="Write your letter. Use Insert field to add merge tokens like {{client.contact_name}}."
                className="font-mono text-sm"
              />
            </div>

            {emailMode && (
              <div className="space-y-3 rounded-lg border p-3">
                <div className="grid gap-1.5">
                  <Label htmlFor="doc-to">To</Label>
                  <Input
                    id="doc-to"
                    type="email"
                    value={recipient}
                    onChange={(e) => setRecipient(e.target.value)}
                    placeholder="client@example.com"
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="doc-cc">CC (comma separated)</Label>
                  <Input
                    id="doc-cc"
                    value={cc}
                    onChange={(e) => setCc(e.target.value)}
                    placeholder="optional"
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="doc-msg">Email message</Label>
                  <Textarea
                    id="doc-msg"
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    rows={3}
                    placeholder="Optional note included in the email body."
                  />
                </div>
              </div>
            )}
          </div>

          {/* Right: live preview */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label>Preview</Label>
              {previewing && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
            </div>
            <ScrollArea className="h-[420px] rounded-lg border bg-muted/30 p-4">
              {title ? <p className="mb-3 text-base font-semibold">{title}</p> : null}
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                {preview || <span className="text-muted-foreground">Nothing to preview yet.</span>}
              </p>
            </ScrollArea>
            <p className="text-xs text-muted-foreground">
              Merged with this {OWNER_TYPE_LABELS[ownerType].toLowerCase()}&apos;s details. Empty
              fields are left blank.
            </p>
          </div>
        </div>

        {error && (
          <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
        )}
        {notice && (
          <div className="rounded-lg bg-primary/10 p-3 text-sm text-primary">{notice}</div>
        )}

        <DialogFooter className="flex-wrap gap-2 sm:justify-between">
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" onClick={handlePrint}>
              <Printer className="mr-2 h-4 w-4" />
              Print
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {!emailMode ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setEmailMode(true)}
              >
                <Mail className="mr-2 h-4 w-4" />
                Email to client
              </Button>
            ) : (
              <Button
                type="button"
                size="sm"
                disabled={saving}
                onClick={() => runCreate('email')}
              >
                {saving ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Mail className="mr-2 h-4 w-4" />
                )}
                Send email
              </Button>
            )}
            <Button type="button" size="sm" disabled={saving} onClick={() => runCreate('save')}>
              {saving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              Save to Documents
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
