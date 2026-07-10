'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { Profile } from '@/lib/types/database'

/** Read one or many global config keys. Returns null for unknown keys. */
export async function getGlobalConfig<T = unknown>(
  key: string,
): Promise<T | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('global_config')
    .select('value')
    .eq('key', key)
    .maybeSingle()
  if (!data) return null
  return (data as { value: T }).value
}

/** Read multiple config keys at once as a Record<key, value>. */
export async function getGlobalConfigs(
  keys: string[],
): Promise<Record<string, unknown>> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('global_config')
    .select('key, value')
    .in('key', keys)
  const result: Record<string, unknown> = {}
  for (const row of data ?? []) {
    const r = row as { key: string; value: unknown }
    result[r.key] = r.value
  }
  return result
}

/** Upsert a single config value (admin/office only). */
export async function setGlobalConfig(
  key: string,
  value: unknown,
): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Not signed in' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  const role = (profile as Pick<Profile, 'role'> | null)?.role
  if (role !== 'admin' && role !== 'office') {
    return { error: 'Not authorised' }
  }

  const { error } = await supabase
    .from('global_config')
    .upsert(
      { key, value, updated_at: new Date().toISOString(), updated_by: user.id },
      { onConflict: 'key' },
    )

  if (error) return { error: error.message }
  revalidatePath('/dashboard/settings')
  return { error: null }
}
