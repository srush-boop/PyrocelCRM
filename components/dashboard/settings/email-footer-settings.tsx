'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Loader2, Plus, Trash2, Info } from 'lucide-react'
import {
  saveMyEmailFooter,
  saveGlobalEmailFooter,
  type EmailFooterValues,
  type EmailFooterLink,
} from '@/lib/actions/email-footer'

const BRAND_RED = '#e11d2a'

function FooterPreview({ values }: { values: EmailFooterValues }) {
  const hasContent = values.message || values.imageUrl || values.links.length > 0
  return (
    <div className="rounded-lg border border-border bg-muted/30 p-4">
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Preview</p>
      {!values.enabled ? (
        <p className="text-sm text-muted-foreground">
          This footer is turned off — the company default will be used instead.
        </p>
      ) : !hasContent ? (
        <p className="text-sm text-muted-foreground">
          Nothing to show yet. Add a message, image or link.
        </p>
      ) : (
        <div className="rounded-md border border-border bg-background p-4">
          {values.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={values.imageUrl || '/placeholder.svg'}
              alt=""
              className="mb-2 h-auto max-w-full"
              style={{ maxHeight: 120 }}
            />
          ) : null}
          {values.message ? (
            <p className="whitespace-pre-line text-[13px] leading-relaxed text-foreground">
              {values.message}
            </p>
          ) : null}
          {values.links.length > 0 ? (
            <p className="mt-2 text-xs text-muted-foreground">
              {values.links.map((l, i) => (
                <span key={i}>
                  {i > 0 ? ' · ' : ''}
                  <span style={{ color: BRAND_RED, fontWeight: 600 }}>{l.label || 'Link'}</span>
                </span>
              ))}
            </p>
          ) : null}
        </div>
      )}
    </div>
  )
}

function FooterEditor({
  initial,
  onSave,
  showEnabledToggle,
  enabledLabel,
}: {
  initial: EmailFooterValues
  onSave: (values: EmailFooterValues) => Promise<{ error: string | null }>
  showEnabledToggle: boolean
  enabledLabel: string
}) {
  const [values, setValues] = useState<EmailFooterValues>(initial)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [pending, startTransition] = useTransition()

  function update(patch: Partial<EmailFooterValues>) {
    setValues((v) => ({ ...v, ...patch }))
  }

  function updateLink(index: number, patch: Partial<EmailFooterLink>) {
    setValues((v) => ({
      ...v,
      links: v.links.map((l, i) => (i === index ? { ...l, ...patch } : l)),
    }))
  }

  function addLink() {
    setValues((v) => ({ ...v, links: [...v.links, { label: '', url: '' }] }))
  }

  function removeLink(index: number) {
    setValues((v) => ({ ...v, links: v.links.filter((_, i) => i !== index) }))
  }

  function handleSave() {
    setMessage(null)
    startTransition(async () => {
      const result = await onSave(values)
      if (result.error) {
        setMessage({ type: 'error', text: result.error })
      } else {
        setMessage({ type: 'success', text: 'Footer saved.' })
      }
    })
  }

  return (
    <div className="space-y-4">
      {showEnabledToggle && (
        <div className="flex items-center justify-between rounded-lg border border-border p-3">
          <div className="space-y-0.5">
            <Label className="text-sm">{enabledLabel}</Label>
            <p className="text-xs text-muted-foreground">
              When off, the company default footer is used on your emails instead.
            </p>
          </div>
          <Switch checked={values.enabled} onCheckedChange={(v) => update({ enabled: v })} />
        </div>
      )}

      <div className="grid gap-2">
        <Label htmlFor="footer-message">Message</Label>
        <Textarea
          id="footer-message"
          value={values.message}
          onChange={(e) => update({ message: e.target.value })}
          placeholder="e.g. Thank you for choosing Pyrocel. For urgent out-of-hours support call 0800 000 0000."
          rows={3}
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="footer-image">Image URL</Label>
        <Input
          id="footer-image"
          type="url"
          value={values.imageUrl}
          onChange={(e) => update({ imageUrl: e.target.value })}
          placeholder="https://example.com/signature-banner.png"
        />
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Info className="h-3.5 w-3.5" />
          Paste a public image URL (e.g. a banner or signature). Email clients cannot load private
          images.
        </p>
      </div>

      <div className="space-y-2">
        <Label>Links</Label>
        {values.links.length === 0 && (
          <p className="text-xs text-muted-foreground">No links yet.</p>
        )}
        <div className="space-y-2">
          {values.links.map((link, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input
                value={link.label}
                onChange={(e) => updateLink(i, { label: e.target.value })}
                placeholder="Label (e.g. Our website)"
                className="flex-1"
              />
              <Input
                value={link.url}
                onChange={(e) => updateLink(i, { url: e.target.value })}
                placeholder="https://…"
                className="flex-1"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => removeLink(i)}
                aria-label="Remove link"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
        {values.links.length < 6 && (
          <Button type="button" variant="outline" size="sm" onClick={addLink} className="gap-2">
            <Plus className="h-4 w-4" />
            Add link
          </Button>
        )}
      </div>

      <FooterPreview values={values} />

      {message && (
        <div
          className={`rounded-lg p-3 text-sm ${
            message.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'
          }`}
        >
          {message.text}
        </div>
      )}

      <Button onClick={handleSave} disabled={pending}>
        {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Save footer
      </Button>
    </div>
  )
}

export function EmailFooterSettings({
  myFooter,
  globalFooter,
  canManageGlobal,
}: {
  myFooter: EmailFooterValues
  globalFooter: EmailFooterValues
  canManageGlobal: boolean
}) {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Your email footer</CardTitle>
          <CardDescription>
            Added to the bottom of service report emails you send. Personalise it with a message,
            image and links. Leave it off to use the company default.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FooterEditor
            initial={myFooter}
            onSave={saveMyEmailFooter}
            showEnabledToggle
            enabledLabel="Use my own footer"
          />
        </CardContent>
      </Card>

      {canManageGlobal && (
        <Card>
          <CardHeader>
            <CardTitle>Company default footer</CardTitle>
            <CardDescription>
              Used on report emails when the sender has not set a footer of their own.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FooterEditor
              initial={globalFooter}
              onSave={saveGlobalEmailFooter}
              showEnabledToggle={false}
              enabledLabel=""
            />
          </CardContent>
        </Card>
      )}
    </div>
  )
}
