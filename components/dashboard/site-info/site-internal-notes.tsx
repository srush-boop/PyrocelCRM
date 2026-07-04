'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { formatDistanceToNow } from 'date-fns'
import { Loader2, MessageSquarePlus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import type { SiteInternalNote } from '@/lib/types/database'

interface SiteInternalNotesProps {
  siteId: string
  notes: SiteInternalNote[]
  currentUserId: string
  canModerate: boolean
}

function roleLabel(role?: string | null) {
  if (!role) return 'Staff'
  return role.charAt(0).toUpperCase() + role.slice(1)
}

/**
 * A shared, communal note thread against a site. Any staff member can post; a
 * note can be removed by its author or by admin/office (enforced by RLS too).
 */
export function SiteInternalNotes({
  siteId,
  notes,
  currentUserId,
  canModerate,
}: SiteInternalNotesProps) {
  const router = useRouter()
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function addNote() {
    const text = body.trim()
    if (!text) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/site-notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ site_id: siteId, body: text }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Could not add note')
      }
      setBody('')
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not add note')
    } finally {
      setBusy(false)
    }
  }

  async function deleteNote(id: string) {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/site-notes?id=${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Could not delete note')
      }
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not delete note')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Textarea
          placeholder="Leave a note for the team about this site (access quirks, contacts, reminders)…"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={2}
        />
        <div className="flex items-center justify-end">
          <Button size="sm" onClick={addNote} disabled={busy || !body.trim()}>
            {busy ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <MessageSquarePlus className="mr-2 h-4 w-4" />
            )}
            Post note
          </Button>
        </div>
      </div>

      {error && (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
      )}

      {notes.length === 0 ? (
        <p className="rounded-md border border-dashed py-6 text-center text-sm text-muted-foreground">
          No internal notes yet.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {notes.map((note) => {
            const canDelete = canModerate || note.author_id === currentUserId
            return (
              <li key={note.id} className="rounded-lg border p-3">
                <div className="mb-1 flex items-center gap-2">
                  <span className="text-sm font-medium">
                    {note.author?.full_name || 'Unknown'}
                  </span>
                  <Badge variant="secondary" className="text-[10px]">
                    {roleLabel(note.author?.role)}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(note.created_at), { addSuffix: true })}
                  </span>
                  {canDelete && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="ml-auto h-7 w-7 text-muted-foreground hover:text-destructive"
                      onClick={() => deleteNote(note.id)}
                      disabled={busy}
                      aria-label="Delete note"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
                <p className="whitespace-pre-wrap text-sm text-foreground">{note.body}</p>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
