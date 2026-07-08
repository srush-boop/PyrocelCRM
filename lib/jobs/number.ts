import type { SupabaseClient } from '@supabase/supabase-js'

const JOB_PREFIX = 'J-'
const PAD = 5

/**
 * Compute the next sequential job number in the form `J-00001`.
 *
 * Reads the current highest `job_number`, parses its numeric suffix and
 * increments it. New/blank databases start at `J-00001`. The caller should
 * tolerate a rare unique-violation race by retrying once (two accepts landing
 * at the same instant); numbering is display-only, not a hard invariant.
 */
export async function nextJobNumber(supabase: SupabaseClient): Promise<string> {
  const { data } = await supabase
    .from('jobs')
    .select('job_number')
    .not('job_number', 'is', null)
    .order('job_number', { ascending: false })
    .limit(1)
    .maybeSingle()

  const current = (data as { job_number?: string | null } | null)?.job_number ?? null
  let next = 1
  if (current) {
    const match = current.match(/(\d+)\s*$/)
    if (match) next = Number.parseInt(match[1], 10) + 1
  }
  return `${JOB_PREFIX}${String(next).padStart(PAD, '0')}`
}
