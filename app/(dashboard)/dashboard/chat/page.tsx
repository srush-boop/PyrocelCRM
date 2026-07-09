import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ensureChatSetup, listChannels, listDmCandidates } from '@/lib/chat/queries'
import { ChatIndex } from '@/components/dashboard/chat/chat-index'

export const metadata = {
  title: 'Chat | Pyrocel CRM',
  description: 'Team messaging across branches and colleagues.',
}

export default async function ChatPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, full_name, avatar_url, role, branch_id, status')
    .eq('id', user.id)
    .maybeSingle()

  const p = profile as {
    id: string
    full_name: string | null
    avatar_url: string | null
    role: string
    branch_id: string | null
    status: string
  } | null

  if (!p || p.status !== 'active' || !['admin', 'office', 'engineer'].includes(p.role)) {
    redirect('/dashboard')
  }

  // Provision branch channels + enrol this user (idempotent, safe every load).
  await ensureChatSetup(user.id, p.branch_id)

  const [channels, dmCandidates] = await Promise.all([
    listChannels(user.id),
    listDmCandidates(user.id),
  ])

  return (
    <ChatIndex
      currentUserId={user.id}
      currentUserName={p.full_name}
      currentUserAvatar={p.avatar_url}
      initialChannels={channels}
      dmCandidates={dmCandidates}
    />
  )
}
