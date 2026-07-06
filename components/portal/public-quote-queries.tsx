'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { MessageCircle, Send } from 'lucide-react'
import { postQuoteQuery } from '@/app/quote/[token]/actions'
import { formatDateTimeUK } from '@/lib/utils'
import type { QuoteMessage } from '@/lib/types/database'

// Client-facing query thread shown beneath the public quote document. Clients
// can raise questions and see staff replies without logging in.
export function PublicQuoteQueries({
  token,
  initialMessages,
}: {
  token: string
  initialMessages: QuoteMessage[]
}) {
  const [messages, setMessages] = useState<QuoteMessage[]>(initialMessages)
  const [name, setName] = useState('')
  const [body, setBody] = useState('')
  const [isPending, startTransition] = useTransition()

  function submit() {
    const trimmed = body.trim()
    if (!trimmed) {
      toast.error('Please enter your question.')
      return
    }
    startTransition(async () => {
      const res = await postQuoteQuery({ token, name: name || undefined, body: trimmed })
      if (!res.ok) {
        toast.error(res.error ?? 'Something went wrong. Please try again.')
        return
      }
      if (res.messages) setMessages(res.messages)
      setBody('')
      toast.success('Your question has been sent.')
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <MessageCircle className="h-5 w-5" />
          Questions about this quote
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
                  className={`flex ${fromStaff ? 'justify-start' : 'justify-end'}`}
                >
                  <div
                    className={`max-w-[85%] rounded-lg border px-3 py-2 text-sm ${
                      fromStaff
                        ? 'bg-muted text-foreground'
                        : 'bg-primary text-primary-foreground'
                    }`}
                  >
                    <p className="whitespace-pre-line leading-relaxed">{m.body}</p>
                    <p
                      className={`mt-1 text-[11px] ${
                        fromStaff ? 'text-muted-foreground' : 'text-primary-foreground/70'
                      }`}
                    >
                      {fromStaff
                        ? m.author_name || 'Our team'
                        : m.author_name || 'You'}{' '}
                      · {formatDateTimeUK(m.created_at)}
                    </p>
                  </div>
                </li>
              )
            })}
          </ol>
        ) : (
          <p className="text-sm text-muted-foreground">
            Have a question before you respond? Send it to us below and our team will get back to
            you.
          </p>
        )}

        <div className="grid gap-3 border-t pt-4">
          <div className="grid gap-1.5">
            <Label htmlFor="query-name">Your name (optional)</Label>
            <Input
              id="query-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              disabled={isPending}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="query-body">Your question</Label>
            <Textarea
              id="query-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Type your question here…"
              rows={3}
              disabled={isPending}
            />
          </div>
          <div>
            <Button onClick={submit} disabled={isPending || !body.trim()}>
              <Send className="mr-2 h-4 w-4" />
              {isPending ? 'Sending…' : 'Send question'}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
