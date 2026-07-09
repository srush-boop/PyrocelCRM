import { createClient } from '@supabase/supabase-js'
const c = createClient(process.env.SUPABASE_URL||process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {auth:{persistSession:false}})
// temp admin
const email='v0-verify@pyrocel.test', password='Verify123!'
const { data: created, error } = await c.auth.admin.createUser({ email, password, email_confirm:true })
let id = created?.user?.id
if (error) { const { data:list } = await c.auth.admin.listUsers(); id = list.users.find(u=>u.email===email)?.id; await c.auth.admin.updateUserById(id,{password, email_confirm:true}) }
await c.from('profiles').upsert({ id, email, full_name:'V0 Verify', role:'admin' })
console.log('ADMINID', id)
// find a site with open calls (via site_id or site_service)
const { data: openTasks } = await c.from('tasks').select('id, site_id, site_service_id, status').in('status',['pending','in_progress','paused']).limit(50)
const bySite = {}
for (const t of openTasks||[]) { if (t.site_id) bySite[t.site_id]=(bySite[t.site_id]||0)+1 }
const top = Object.entries(bySite).sort((a,b)=>b[1]-a[1])[0]
console.log('SITE_WITH_OPEN', JSON.stringify(top))
