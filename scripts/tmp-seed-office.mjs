import pg from 'pg'
import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const service = process.env.SUPABASE_SERVICE_ROLE_KEY
const admin = createClient(url, service, { auth: { autoRefreshToken: false, persistSession: false } })

const email = 'tmp.office.verify@pyroceltest.co.uk'
const password = 'TmpOfficeVerify1234'

// Create (or fetch) the auth user.
const { data: created, error } = await admin.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
})
let userId = created?.user?.id
if (error) {
  console.log('createUser:', error.message)
  const { data: list } = await admin.auth.admin.listUsers()
  userId = list.users.find((u) => u.email === email)?.id
}
console.log('userId', userId)

// Ensure an active office profile.
const client = new pg.Client({ connectionString: process.env.POSTGRES_URL_NON_POOLING.replace(/\?sslmode=\w+/, ''), ssl: { rejectUnauthorized: false } })
await client.connect()
await client.query(
  `insert into profiles (id, email, full_name, role, status, onboarded_at)
   values ($1,$2,'Temp Office Verify','office','active', now())
   on conflict (id) do update set role='office', status='active', onboarded_at=now()`,
  [userId, email],
)
await client.end()
console.log('profile ready for', email, password)
