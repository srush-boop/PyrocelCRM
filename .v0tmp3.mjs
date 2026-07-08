import { createClient } from '@supabase/supabase-js'
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const { data: st } = await sb.from('tasks').select('status')
const counts = {}; for (const r of st||[]) counts[r.status]=(counts[r.status]||0)+1
console.log('task statuses:', JSON.stringify(counts))
const { count: total } = await sb.from('tasks').select('*',{count:'exact',head:true})
const { count: withStart } = await sb.from('tasks').select('*',{count:'exact',head:true}).not('started_at','is',null)
const { count: withComplete } = await sb.from('tasks').select('*',{count:'exact',head:true}).not('completed_at','is',null)
const { count: withBookedDur } = await sb.from('tasks').select('*',{count:'exact',head:true}).not('booked_duration_minutes','is',null)
const { count: withSched } = await sb.from('tasks').select('*',{count:'exact',head:true}).not('scheduled_date','is',null)
console.log({total, withStart, withComplete, withBookedDur, withSched})
const { count: sitesTotal } = await sb.from('sites').select('*',{count:'exact',head:true})
const { count: sitesGeo } = await sb.from('sites').select('*',{count:'exact',head:true}).not('latitude','is',null)
const { count: sitesPc } = await sb.from('sites').select('*',{count:'exact',head:true}).not('postcode','is',null)
console.log({sitesTotal, sitesGeo, sitesPc})
// service_services with route
const { count: ssTotal } = await sb.from('site_services').select('*',{count:'exact',head:true})
const { count: ssRoute } = await sb.from('site_services').select('*',{count:'exact',head:true}).not('route_id','is',null)
console.log({ssTotal, ssRoute})
// sample durations by service_type from completed tasks
const { data: dur } = await sb.from('tasks').select('started_at, completed_at, site_service:site_services(service_type:service_types(name))').not('started_at','is',null).not('completed_at','is',null).limit(500)
const byType={}
for (const t of dur||[]){const n=t.site_service?.service_type?.name||'?';const ms=new Date(t.completed_at)-new Date(t.started_at);if(ms>0&&ms<12*3600*1000){(byType[n]=byType[n]||[]).push(ms/60000)}}
for (const [n,arr] of Object.entries(byType)){const avg=arr.reduce((a,b)=>a+b,0)/arr.length;console.log(`dur ${n}: n=${arr.length} avg=${Math.round(avg)}min`)}
