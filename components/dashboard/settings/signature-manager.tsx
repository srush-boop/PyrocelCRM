'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { Button } from '@/components/ui/button'
import { SignaturePad } from '@/components/rams/signature-pad'
import { Loader2, Upload, Trash2, PenLine } from 'lucide-react'

interface SignatureManagerProps {
  signatureUrl: string | null
}

/** Convert a data URL (from the drawing pad) into a File for upload. */
function dataUrlToFile(dataUrl: string, filename: string): File {
  const [header, base64] = dataUrl.split(',')
  const mime = header.match(/:(.*?);/)?.[1] ?? 'image/png'
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new File([bytes], filename, { type: mime })
}

export function SignatureManager({ signatureUrl }: SignatureManagerProps) {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isPending, startTransition] = useTransition()
  const [mode, setMode] = useState<'view' | 'draw'>('view')
  const [drawnDataUrl, setDrawnDataUrl] = useState<string | null>(null)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  function uploadFile(file: File) {
    setMessage(null)
    startTransition(async () => {
      const formData = new FormData()
      formData.append('signature', file)
      const res = await fetch('/api/profile/signature', { method: 'POST', body: formData })
      const data = await res.json()
      if (!res.ok) {
        setMessage({ type: 'error', text: data.error || 'Upload failed.' })
        return
      }
      setMode('view')
      setDrawnDataUrl(null)
      setMessage({ type: 'success', text: 'Signature saved.' })
      router.refresh()
    })
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) uploadFile(file)
    e.target.value = ''
  }

  function handleSaveDrawn() {
    if (!drawnDataUrl) {
      setMessage({ type: 'error', text: 'Please draw your signature first.' })
      return
    }
    uploadFile(dataUrlToFile(drawnDataUrl, 'signature.png'))
  }

  function handleRemove() {
    setMessage(null)
    startTransition(async () => {
      const res = await fetch('/api/profile/signature', { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) {
        setMessage({ type: 'error', text: data.error || 'Failed to remove.' })
        return
      }
      setMessage({ type: 'success', text: 'Signature removed.' })
      router.refresh()
    })
  }

  return (
    <div className="space-y-4">
      {message && (
        <div
          className={`rounded-lg p-3 text-sm ${
            message.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'
          }`}
        >
          {message.text}
        </div>
      )}

      {signatureUrl ? (
        <div className="flex flex-wrap items-center gap-4">
          <div className="rounded-md border bg-white p-3">
            <Image
              src={signatureUrl || '/placeholder.svg'}
              alt="Your saved signature"
              width={220}
              height={90}
              className="h-[90px] w-auto object-contain"
              unoptimized
            />
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleRemove}
            disabled={isPending}
          >
            <Trash2 className="mr-2 h-4 w-4 text-destructive" />
            Remove
          </Button>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          No signature saved yet. Upload an image or draw one below.
        </p>
      )}

      {mode === 'draw' ? (
        <div className="space-y-3">
          <SignaturePad onChange={setDrawnDataUrl} className="max-w-md" />
          <div className="flex gap-2">
            <Button type="button" onClick={handleSaveDrawn} disabled={isPending} size="sm">
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save signature
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setMode('view')
                setDrawnDataUrl(null)
              }}
              disabled={isPending}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileChange}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={isPending}
          >
            <Upload className="mr-2 h-4 w-4" />
            Upload image
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setMode('draw')}
            disabled={isPending}
          >
            <PenLine className="mr-2 h-4 w-4" />
            Draw signature
          </Button>
        </div>
      )}
    </div>
  )
}
