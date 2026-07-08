import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Missing Supabase env')
  process.exit(1)
}
const admin = createClient(url, key, { auth: { persistSession: false } })

const email = 'v0-verify@pyrocel.test'
const password = 'VerifyPass123!'

// Find existing
const { data: list } = await admin.auth.admin.listUsers({ perPage: 200 })
let user = list?.users?.find((u) => u.email === email)
if (user) {
  await admin.auth.admin.updateUserById(user.id, { password, email_confirm: true })
} else {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: 'V0 Verify', role: 'admin' },
  })
  if (error) {
    console.error(error.message)
    process.exit(1)
  }
  user = data.user
}
await admin
  .from('profiles')
  .upsert({ id: user.id, email, full_name: 'V0 Verify', role: 'admin', status: 'active' })
console.log('OK', email, password)
