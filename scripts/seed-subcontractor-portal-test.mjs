// One-off: create a test subcontractor LEAD login and allocate one existing
// site_service (that already has open calls) to that subcontractor company, so
// the portal has real data to smoke-test. Safe to re-run (idempotent-ish).
import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !serviceKey) {
  console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const SUPPLIER_ID = '9c72e83e-5442-4d44-880e-5df0ed84cd5f' // Acme Fire Services
const EMAIL = 'sub.lead@pyroceltest.co.uk'
const PASSWORD = 'SubPortalTest1234'

async function main() {
  // 1. Pick a site_service that already has open calls, allocate it to the company.
  const { data: openTask } = await admin
    .from('tasks')
    .select('id, site_service_id, scheduled_date, status')
    .in('status', ['pending', 'in_progress', 'paused'])
    .not('site_service_id', 'is', null)
    .order('scheduled_date', { ascending: true })
    .limit(1)
    .single()

  if (!openTask) {
    console.log('No open call with a site_service found; portal will be empty.')
  } else {
    const { error: allocErr } = await admin
      .from('site_services')
      .update({ subcontractor_id: SUPPLIER_ID })
      .eq('id', openTask.site_service_id)
    if (allocErr) throw allocErr
    console.log(`Allocated site_service ${openTask.site_service_id} -> Acme Fire Services`)
  }

  // 2. Create (or fetch) the auth user.
  let userId
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email: EMAIL,
    password: PASSWORD,
    email_confirm: true,
  })
  if (createErr) {
    if (!createErr.message.toLowerCase().includes('already')) throw createErr
    const { data: list } = await admin.auth.admin.listUsers()
    userId = list.users.find((u) => u.email === EMAIL)?.id
    console.log('User already existed, reusing.')
  } else {
    userId = created.user.id
  }

  // 3. Upsert the profile as a subcontractor lead linked to the company.
  const now = new Date().toISOString()
  const { error: profErr } = await admin.from('profiles').upsert({
    id: userId,
    email: EMAIL,
    full_name: 'Test Sub Lead',
    role: 'subcontractor',
    status: 'active',
    supplier_id: SUPPLIER_ID,
    is_subcontractor_lead: true,
    accepted_at: now,
    updated_at: now,
  })
  if (profErr) throw profErr

  console.log('\nTest subcontractor lead ready:')
  console.log(`  email:    ${EMAIL}`)
  console.log(`  password: ${PASSWORD}`)
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e)
    process.exit(1)
  },
)
