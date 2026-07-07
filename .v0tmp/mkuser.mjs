import { createClient } from '@supabase/supabase-js'
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })
const email = 'v0-verify+jobs@example.com'
const password = 'V0Verify!' + Math.random().toString(36).slice(2, 10)
// clean any prior
const { data: list } = await sb.auth.admin.listUsers()
const existing = list?.users?.find(u => u.email === email)
if (existing) { await sb.from('profiles').delete().eq('id', existing.id); await sb.auth.admin.deleteUser(existing.id) }
const { data: created, error } = await sb.auth.admin.createUser({ email, password, email_confirm: true })
if (error) { console.log('ERR create', error.message); process.exit(1) }
const uid = created.user.id
// pick a branch (optional) - none, admin sees all
const { error: pErr } = await sb.from('profiles').upsert({ id: uid, email, full_name: 'V0 Verify', role: 'admin', status: 'active' })
if (pErr) { console.log('ERR profile', pErr.message); process.exit(1) }
console.log('CREDS', JSON.stringify({ email, password, uid }))
