import { createClient } from '@supabase/supabase-js'
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
for (const t of ['tasks','routes','profiles','service_types','site_services','service_visit_types','task_transfer_requests']) {
  const { data, error } = await sb.from(t).select('*').limit(1)
  console.log(`\n### ${t}: ${error ? 'ERR '+error.message : (data?.[0] ? Object.keys(data[0]).join(', ') : '(no rows)')}`)
}
