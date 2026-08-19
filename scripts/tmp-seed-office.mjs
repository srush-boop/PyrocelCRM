import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })

const email = 'tmp.office.verify@pyroceltest.co.uk'
const password = 'TmpOfficeVerify1234'

const { data: created, error } = await admin.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
})
if (error && !String(error.message).includes('already been registered')) {
  console.error('create failed', error.message)
  process.exit(1)
}

// Find the user id (created or pre-existing)
let userId = created?.user?.id
if (!userId) {
  const { data: list } = await admin.auth.admin.listUsers()
  userId = list.users.find((u) => u.email === email)?.id
}
if (!userId) {
  console.error('no user id')
  process.exit(1)
}

const { error: upErr } = await admin
  .from('profiles')
  .update({ role: 'office', status: 'active', full_name: 'Temp Office Verify' })
  .eq('id', userId)
if (upErr) {
  console.error('profile update failed', upErr.message)
  process.exit(1)
}
console.log('OK', email, userId)
