import { createClient } from '@supabase/supabase-js'

const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const email = 'tmp.office.parts@pyroceltest.co.uk'
const password = 'TmpOfficeParts1234'

// Clean any prior
const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 })
const existing = list.users.find((u) => u.email === email)
if (existing) await admin.auth.admin.deleteUser(existing.id)

const { data: created, error } = await admin.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
})
if (error) {
  console.log('CREATE ERROR', error.message)
  process.exit(1)
}
const id = created.user.id
await admin
  .from('profiles')
  .upsert({ id, email, full_name: 'Temp Office Parts', role: 'office', status: 'active' })
console.log('SEEDED', id)
