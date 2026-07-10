import { createClient } from '@supabase/supabase-js'
const c = createClient(process.env.SUPABASE_URL||process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {auth:{persistSession:false}})
const email='v0-verify@pyrocel.test', password='Verify123!'
const { data: created, error } = await c.auth.admin.createUser({ email, password, email_confirm:true })
let id = created?.user?.id
if (error) { const { data:list } = await c.auth.admin.listUsers(); id = list.users.find(u=>u.email===email)?.id; await c.auth.admin.updateUserById(id,{password, email_confirm:true}) }
await c.from('profiles').upsert({ id, email, full_name:'V0 Verify', role:'admin' })
const { data: q } = await c.from('quotes').select('id, quote_number, reference, title, client_id, site_id').limit(1).maybeSingle()
console.log('QUOTE', JSON.stringify(q))
