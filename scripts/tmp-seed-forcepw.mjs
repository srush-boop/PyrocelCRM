import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY
const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })

const EMAIL = 'tmp-forcepw@example.com'
const PASSWORD = 'TempPass123456!'

const { data: created, error: cErr } = await admin.auth.admin.createUser({
  email: EMAIL,
  password: PASSWORD,
  email_confirm: true,
  user_metadata: { full_name: 'Force PW Test', role: 'engineer' },
})
if (cErr) {
  console.error('create error', cErr.message)
  process.exit(1)
}
const id = created.user.id
const now = new Date().toISOString()
const { error: pErr } = await admin.from('profiles').upsert({
  id,
  email: EMAIL,
  full_name: 'Force PW Test',
  role: 'engineer',
  status: 'active',
  accepted_at: now,
  onboarded_at: now,
  must_change_password: true,
  updated_at: now,
})
if (pErr) {
  console.error('profile error', pErr.message)
  process.exit(1)
}
console.log('SEEDED', id, EMAIL, PASSWORD)
