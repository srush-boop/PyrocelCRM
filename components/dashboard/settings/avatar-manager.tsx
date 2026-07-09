'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Loader2, Upload, Trash2 } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'

interface AvatarManagerProps {
  avatarUrl: string | null
  fullName: string | null
}

function initials(name: string | null): string {
  if (!name) return '?'
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('')
}

/**
 * Upload / remove the current user's profile picture. Posts to the avatar
 * route (Blob upload + profile update) and refreshes so the new picture shows
 * across the app (chat, header, etc.).
 */
export function AvatarManager({ avatarUrl, fullName }: AvatarManagerProps) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [preview, setPreview] = useState<string | null>(avatarUrl)

  const upload = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      toast.error('Please choose an image file')
      return
    }
    if (file.size > 4 * 1024 * 1024) {
      toast.error('Image must be under 4MB')
      return
    }
    setBusy(true)
    try {
      const form = new FormData()
      form.append('avatar', file)
      const res = await fetch('/api/profile/avatar', { method: 'POST', body: form })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Upload failed')
      setPreview(json.avatar_url)
      toast.success('Profile picture updated')
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    setBusy(true)
    try {
      const res = await fetch('/api/profile/avatar', { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to remove')
      setPreview(null)
      toast.success('Profile picture removed')
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to remove')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex items-center gap-4">
      <Avatar className="h-20 w-20">
        <AvatarImage src={preview ?? undefined} alt="Your profile picture" />
        <AvatarFallback className="text-lg">{initials(fullName)}</AvatarFallback>
      </Avatar>
      <div className="flex flex-col gap-2">
        <input
          ref={inputRef}
          id="avatar-file-input"
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) void upload(file)
            e.target.value = ''
          }}
        />
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
          >
            {busy ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Upload className="mr-2 h-4 w-4" />
            )}
            {preview ? 'Change' : 'Upload'}
          </Button>
          {preview && (
            <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => void remove()}>
              <Trash2 className="mr-2 h-4 w-4" />
              Remove
            </Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground">JPG, PNG or GIF, up to 4MB.</p>
      </div>
    </div>
  )
}
