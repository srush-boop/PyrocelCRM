import { createClient } from '@supabase/supabase-js'
const c = createClient(process.env.SUPABASE_URL||process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {auth:{persistSession:false}})
const { data: st } = await c.from('service_types').select('id, name, call_kind, is_recurring').ilike('name','commission%').single()
const { data: ct } = await c.from('checklist_templates').select('name, system_type_id, visit_type_id, items').eq('service_type_id', st.id)
console.log(JSON.stringify({st, templates: ct.map(t=>({name:t.name, system_type_id:t.system_type_id, visit_type_id:t.visit_type_id, items:(t.items||[]).length}))}, null, 2))
