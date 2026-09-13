import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Returns the teams the signed-in user owns, each with its members resolved to
// display names. RLS scopes rows to teams the user owns (member-read teams are
// managed by their owners, not surfaced in this builder).
export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: teams } = await supabase
    .from('todo_teams')
    .select('id, name, color, created_at')
    .eq('owner_id', user.id)
    .order('name', { ascending: true })

  const teamIds = (teams ?? []).map((t) => t.id)
  const membersByTeam: Record<string, { user_id: string; full_name: string | null }[]> = {}

  if (teamIds.length > 0) {
    const { data: rows } = await supabase
      .from('todo_team_members')
      .select('team_id, user_id, profile:profiles(full_name)')
      .in('team_id', teamIds)

    for (const row of (rows ?? []) as unknown as {
      team_id: string
      user_id: string
      profile: { full_name: string | null } | { full_name: string | null }[] | null
    }[]) {
      const prof = Array.isArray(row.profile) ? row.profile[0] : row.profile
      if (!membersByTeam[row.team_id]) membersByTeam[row.team_id] = []
      membersByTeam[row.team_id].push({
        user_id: row.user_id,
        full_name: prof?.full_name ?? null,
      })
    }
  }

  const result = (teams ?? []).map((t) => ({
    id: t.id,
    name: t.name,
    color: t.color,
    members: membersByTeam[t.id] ?? [],
  }))

  return NextResponse.json({ teams: result })
}
