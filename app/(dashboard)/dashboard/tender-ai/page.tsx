import Link from 'next/link'
import { requireTenderAccess } from '@/lib/tender/access'
import { getTenderStats, getTenders } from '@/lib/tender/data'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { TENDER_STATUS_META } from '@/lib/tender/types'
import {
  BookOpen,
  Paperclip,
  MessageSquareText,
  FileSignature,
  History,
  Sparkles,
  ArrowRight,
  Archive,
} from 'lucide-react'

export default async function TenderAiDashboardPage() {
  await requireTenderAccess()
  const [stats, tenders] = await Promise.all([getTenderStats(), getTenders()])
  const recentTenders = tenders.slice(0, 5)

  const statCards = [
    { label: 'Knowledge Items', value: stats.knowledgeCount, hint: `${stats.criticalCount} critical`, icon: BookOpen },
    { label: 'Evidence Documents', value: stats.evidenceCount, icon: Paperclip },
    { label: 'AI Prompts', value: stats.promptCount, icon: MessageSquareText },
    { label: 'Active Tenders', value: stats.tenderCount, icon: FileSignature },
    { label: 'Winning Responses', value: stats.winningCount, icon: History },
    { label: 'Vault Tenders', value: stats.vaultCount, icon: Archive },
  ]

  const quickLinks = [
    { title: 'Knowledge Centre', description: 'Add and manage the company knowledge the AI draws on.', href: '/dashboard/tender-ai/knowledge', icon: BookOpen },
    { title: 'Active Tenders', description: 'Answer tender questions with AI-drafted, sourced responses.', href: '/dashboard/tender-ai/tenders', icon: FileSignature },
    { title: 'Evidence Library', description: 'Store certificates and documents to attach to bids.', href: '/dashboard/tender-ai/evidence', icon: Paperclip },
    { title: 'AI Prompt Library', description: 'Reusable prompt templates for common bid tasks.', href: '/dashboard/tender-ai/prompts', icon: MessageSquareText },
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Sparkles className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Tender AI</h1>
          <p className="text-muted-foreground">
            Your intelligent bid-writing assistant, grounded in your company knowledge.
          </p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {statCards.map((s) => (
          <Card key={s.label}>
            <CardContent className="flex items-center gap-3 p-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                <s.icon className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="text-2xl font-bold leading-none">{s.value}</p>
                <p className="truncate text-sm text-muted-foreground">{s.label}</p>
                {s.hint ? <p className="text-xs text-muted-foreground">{s.hint}</p> : null}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {quickLinks.map((link) => (
          <Link key={link.href} href={link.href}>
            <Card className="h-full transition-colors hover:border-primary/50 hover:bg-muted/40">
              <CardContent className="flex items-start gap-4 p-5">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <link.icon className="h-5 w-5" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold">{link.title}</h3>
                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <p className="text-sm text-muted-foreground">{link.description}</p>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Recent Tenders</CardTitle>
        </CardHeader>
        <CardContent>
          {recentTenders.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No tenders yet.{' '}
              <Link href="/dashboard/tender-ai/tenders" className="text-primary underline-offset-4 hover:underline">
                Create your first tender
              </Link>{' '}
              to start answering questions.
            </p>
          ) : (
            <ul className="divide-y">
              {recentTenders.map((t) => (
                <li key={t.id}>
                  <Link
                    href={`/dashboard/tender-ai/tenders/${t.id}`}
                    className="flex items-center justify-between gap-3 py-3 transition-colors hover:text-primary"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium">{t.title}</p>
                      {t.client_name ? (
                        <p className="truncate text-sm text-muted-foreground">{t.client_name}</p>
                      ) : null}
                    </div>
                    <Badge variant="secondary">{TENDER_STATUS_META[t.status].label}</Badge>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
