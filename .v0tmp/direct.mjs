import { createClient } from '@supabase/supabase-js'
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const OID='53f23aab-0600-4a49-aaeb-fbf364461f8d'
const { data, error } = await sb.from('profiles').select('*').eq('id', OID).maybeSingle()
console.log('profile by id error:', error?.message||'none')
console.log('profile:', JSON.stringify(data,null,1))

// re-run email search but capture error
const { data: byEmail, error: e2 } = await sb.from('profiles').select('id,email,full_name,role,is_active').ilike('email','%wood%')
console.log('\nilike wood error:', e2?.message||'none', 'rows:', byEmail?.length)
console.log(JSON.stringify(byEmail,null,1))
