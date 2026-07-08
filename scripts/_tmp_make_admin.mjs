import { createClient } from '@supabase/supabase-js'
const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const svc = process.env.SUPABASE_SERVICE_ROLE_KEY
const c = createClient(url, svc, { auth: { persistSession: false } })
const email = 'v0-verify@pyrocel.test'
const password = 'VerifyPass123!'
const { data: list } = await c.auth.admin.listUsers()
let u = list.users.find((x) => x.email === email)
if (!u) {
  const { data, error } = await c.auth.admin.createUser({ email, password, email_confirm: true })
  if (error) throw error
  u = data.user
}
await c.from('profiles').upsert({ id: u.id, email, full_name: 'V0 Verify', role: 'admin' })
console.log('admin ready', u.id)
