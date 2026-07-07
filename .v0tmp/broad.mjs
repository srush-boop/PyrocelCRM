import { createClient } from '@supabase/supabase-js'
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

// profiles: any 'alan' or 'wood' in email or name
const { data: p1 } = await sb.from('profiles').select('id,full_name,email,role,is_active,created_at').or('email.ilike.%alan%,email.ilike.%wood%,full_name.ilike.%alan%,full_name.ilike.%wood%')
console.log('PROFILES ~ alan/wood:', JSON.stringify(p1,null,1))

// auth users containing alan or wood
const { data: authList } = await sb.auth.admin.listUsers({ page:1, perPage:1000 })
const matches=(authList?.users||[]).filter(u=>/alan|wood/i.test(u.email||'')|| /alan|wood/i.test(JSON.stringify(u.user_metadata||{})))
console.log('\nAUTH ~ alan/wood:', matches.length)
matches.forEach(u=>console.log(JSON.stringify({id:u.id,email:u.email,meta:u.user_metadata,created:u.created_at})))
console.log('\nTOTAL auth users:', authList?.users?.length)
