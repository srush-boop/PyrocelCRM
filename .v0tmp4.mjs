import { createClient } from '@supabase/supabase-js'
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const { data: p } = await sb.from('profiles').select('*').limit(1)
console.log('profiles cols:', p?.[0]?Object.keys(p[0]).join(', '):'(no rows)')
// engineers count
const { data: roles } = await sb.from('profiles').select('role')
const rc={}; for(const r of roles||[])rc[r.role]=(rc[r.role]||0)+1
console.log('roles:', JSON.stringify(rc))
// service_types cols for default duration
const { data: svc } = await sb.from('service_types').select('*').limit(1)
console.log('service_types cols:', svc?.[0]?Object.keys(svc[0]).join(', '):'(no rows)')
// visit_types cols
const { data: vt } = await sb.from('service_visit_types').select('*').limit(1)
console.log('service_visit_types cols:', vt?.[0]?Object.keys(vt[0]).join(', '):'(no rows)')
