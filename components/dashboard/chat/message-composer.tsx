'use client'

import { useRef, useState, useTransition } from 'react'
import { ImagePlus, SendHorizontal, X, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { sendMessage } from '@/lib/chat/actions'
import { blobSrc } from '@/lib/blob'

interface MessageComposerProps {
  channelId: string
  onSent: () => void
}

export function MessageComposer({ channelId, onSent }: MessageComposerProps) {
  const [body, setBody] = useState('')
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [pending, startTransition] = useTransition()
  const fileRef = useRef<HTMLInputElement>(null)

  const canSend = (body.trim().length > 0 || imageUrl) && !pending && !uploading

  const submit = () => {
    if (!canSend) return
    const payload = { channelId, body: body.trim() || null, imageUrl }
    setBody('')
    setImageUrl(null)
    startTransition(async () => {
      const res = await sendMessage(payload)
      if (!res.ok) {
        toast.error(res.error)
        // Restore the draft so nothing is lost.
        setBody(payload.body ?? '')
        setImageUrl(payload.imageUrl)
        return
      }
      onSent()
    })
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter sends; Shift+Enter newlines. Respect IME composition.
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && e.keyCode !== 229) {
      e.preventDefault()
      submit()
    }
  }

  const onPickFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('image', file)
      const res = await fetch('/api/chat/upload', { method: 'POST', body: fd })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Upload failed')
      // Store the pathname (persisted with the message); preview resolves it via blobSrc.
      setImageUrl(json.pathname)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <div className="border-t p-3">
      {imageUrl && (
        <div className="relative mb-2 inline-block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={blobSrc(imageUrl) || '/placeholder.svg'} alt="Attachment preview" className="max-h-32 rounded-lg" />
          <button
            type="button"
            onClick={() => setImageUrl(null)}
            className="absolute -right-2 -top-2 rounded-full bg-foreground p-1 text-background"
            aria-label="Remove image"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      )}
      <div className="flex items-end gap-2">
        <input
          ref={fileRef}
          id="chat-image-input"
          type="file"
          accept="image/*"
          className="hidden"
          onChange={onPickFile}
        />
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-10 w-10 shrink-0"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          aria-label="Attach image"
        >
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
        </Button>
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Write a message…"
          rows={1}
          className="max-h-32 min-h-10 resize-none"
        />
        <Button
          type="button"
          size="icon"
          className="h-10 w-10 shrink-0"
          onClick={submit}
          disabled={!canSend}
          aria-label="Send message"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <SendHorizontal className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  )
}
