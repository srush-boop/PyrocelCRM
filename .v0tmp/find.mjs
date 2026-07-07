import { createClient } from '@supabase/supabase-js'
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const EMAIL='alan.wood@pyrocel.co.uk'

// profiles
const { data: profs } = await sb.from('profiles').select('*').ilike('email', EMAIL)
console.log('PROFILES matching:', profs?.length)
console.log(JSON.stringify(profs,null,1))

// auth users
const { data: authList, error } = await sb.auth.admin.listUsers({ page:1, perPage:1000 })
if(error) console.log('auth err', error.message)
const matches = (authList?.users||[]).filter(u=>u.email?.toLowerCase()===EMAIL.toLowerCase())
console.log('\nAUTH USERS matching:', matches.length)
matches.forEach(u=>console.log(JSON.stringify({id:u.id,email:u.email,created_at:u.created_at,last_sign_in_at:u.last_sign_in_at,confirmed:u.email_confirmed_at,banned:u.banned_until},null,0)))

// Also profiles by name (in case email differs)
const { data: byName } = await sb.from('profiles').select('id,full_name,email,role,is_active').ilike('full_name','%wood%')
console.log('\nPROFILES name ~ wood:', JSON.stringify(byName,null,1))
