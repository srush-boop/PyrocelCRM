import { createClient } from '@supabase/supabase-js'
const url=process.env.SUPABASE_URL||process.env.NEXT_PUBLIC_SUPABASE_URL
const anon=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY||process.env.SUPABASE_ANON_KEY
const c = createClient(url, anon, {auth:{persistSession:false}})
const { error: se } = await c.auth.signInWithPassword({ email:'v0-verify@pyrocel.test', password:'Verify123!' })
console.log('SIGNIN', se?.message||'ok')
const id='51572632-f6b2-487a-9648-97d7bfc8d58a'
const { data: ss } = await c.from('site_services').select('id').eq('site_id', id)
const ids=(ss||[]).map(s=>s.id)
const filter = ids.length>0 ? `site_id.eq.${id},site_service_id.in.(${ids.join(',')})` : `site_id.eq.${id}`
const open = await c.from('tasks').select('id, status, site_id, site_service_id').or(filter).in('status',['pending','in_progress','paused'])
console.log('RLS OPEN ERR', open.error?.message||'none', 'rows', open.data?.length)
// also raw count of any tasks visible
const all = await c.from('tasks').select('id', {count:'exact', head:true})
console.log('RLS ALL TASKS COUNT', all.count, all.error?.message||'')
// admin profile branch
const { data: me } = await c.from('profiles').select('id, role, branch_id').eq('email','v0-verify@pyrocel.test').maybeSingle()
console.log('ME', JSON.stringify(me))
