import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const supabase = createClient(url, serviceKey, { auth: { persistSession: false } })

const email = 'v0-damper-test@example.com'
const password = 'DamperTest!2026'

// Create or fetch the user
const { data: created, error: createErr } = await supabase.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
})

let userId = created?.user?.id
if (createErr) {
  // already exists - find them
  const { data: list } = await supabase.auth.admin.listUsers()
  const existing = list.users.find((u) => u.email === email)
  userId = existing?.id
  if (userId) {
    await supabase.auth.admin.updateUserById(userId, { password, email_confirm: true })
  }
}

if (!userId) {
  console.log('FAILED to create user:', createErr?.message)
  process.exit(1)
}

// Ensure an admin profile exists
const { error: profErr } = await supabase
  .from('profiles')
  .upsert({ id: userId, role: 'admin', full_name: 'V0 Damper Test', email }, { onConflict: 'id' })

console.log('USER_ID', userId)
console.log('PROFILE_ERR', profErr?.message || 'none')
console.log('EMAIL', email)
console.log('PASSWORD', password)
