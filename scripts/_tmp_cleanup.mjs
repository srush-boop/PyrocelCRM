import { createClient } from '@supabase/supabase-js'
const c = createClient(process.env.SUPABASE_URL||process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {auth:{persistSession:false}})
// Remove the empty per-system checklist stubs created during browser verification.
const { data: st } = await c.from('service_types').select('id').ilike('name','commission%').single()
const del = await c.from('checklist_templates').delete().eq('service_type_id', st.id).is('visit_type_id', null).in('name', ['Commissioning — Fire Alarm','Commissioning — CCTV'])
// Remove temp admin user + profile.
const { data: list } = await c.auth.admin.listUsers()
const u = list.users.find(x=>x.email==='v0-verify@pyrocel.test')
if (u) { await c.from('profiles').delete().eq('id', u.id); await c.auth.admin.deleteUser(u.id) }
console.log('cleanup done', { deletedTemplates: del.error?del.error.message:'ok', removedUser: !!u })
