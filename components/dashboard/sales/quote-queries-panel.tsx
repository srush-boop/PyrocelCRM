'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { MessageCircle, Send } from 'lucide-react'
import { replyToQuoteMessage, markQuoteQueriesRead } from '@/app/(dashboard)/dashboard/sales/actions'
import { formatDateTimeUK } from '@/lib/utils'
import type { QuoteMessage } from '@/lib/types/database'

// Staff-facing query thread on the quote detail page. Shows the client<->staff
// conversation and lets staff reply. Opening the panel marks client queries read.
export function QuoteQueriesPanel({
  quoteId,
  initialMessages,
}: {
  quoteId: string
  initialMessages: QuoteMessage[]
}) {
  const [messages, setMessages] = useState<QuoteMessage[]>(initialMessages)
  const [body, setBody] = useState('')
  const [isPending, startTransition] = useTransition()
  const markedRef = useRef(false)

  const unreadCount = messages.filter(
    (m) => m.author_type === 'client' && !m.read_at,
  ).length

  // Clear the unread badge once staff view the thread (only when there is unread).
  useEffect(() => {
    if (markedRef.current || unreadCount === 0) return
    markedRef.current = true
    void markQuoteQueriesRead(quoteId).then(() => {
      setMessages((prev) =>
        prev.map((m) =>
          m.author_type === 'client' && !m.read_at
            ? { ...m, read_at: new Date().toISOString() }
            : m,
        ),
      )
    })
  }, [quoteId, unreadCount])

  function submit() {
    const trimmed = body.trim()
    if (!trimmed) {
      toast.error('Please enter a reply.')
      return
    }
    startTransition(async () => {
      const res = await replyToQuoteMessage({ quoteId, body: trimmed })
      if (!res.ok) {
        toast.error(res.error ?? 'Something went wrong. Please try again.')
        return
      }
      if (res.messages) setMessages(res.messages)
      setBody('')
      toast.success('Reply sent to the client.')
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <MessageCircle className="h-5 w-5" />
          Client queries
          {unreadCount > 0 && (
            <Badge variant="destructive" className="ml-1">
              {unreadCount} new
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-5">
        {messages.length > 0 ? (
          <ol className="grid gap-3">
            {messages.map((m) => {
              const fromStaff = m.author_type === 'staff'
              return (
                <li
                  key={m.id}
                  className={`flex ${fromStaff ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[85%] rounded-lg border px-3 py-2 text-sm ${
                      fromStaff
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-foreground'
                    }`}
                  >
                    <p className="whitespace-pre-line leading-relaxed">{m.body}</p>
                    <p
                      className={`mt-1 text-[11px] ${
                        fromStaff ? 'text-primary-foreground/70' : 'text-muted-foreground'
                      }`}
                    >
                      {fromStaff
                        ? m.author_name || 'You'
                        : m.author_name || 'Client'}{' '}
                      · {formatDateTimeUK(m.created_at)}
                    </p>
                  </div>
                </li>
              )
            })}
          </ol>
        ) : (
          <p className="text-sm text-muted-foreground">
            No questions from the client yet. Any queries raised from the quote link will appear
            here.
          </p>
        )}

        <div className="grid gap-3 border-t pt-4">
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Write a reply to the client…"
            rows={3}
            disabled={isPending}
          />
          <div>
            <Button onClick={submit} disabled={isPending || !body.trim()}>
              <Send className="mr-2 h-4 w-4" />
              {isPending ? 'Sending…' : 'Send reply'}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
