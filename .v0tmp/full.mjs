import { createClient } from '@supabase/supabase-js'
import crypto from 'node:crypto'
function mk(uid){function b64(o){return Buffer.from(JSON.stringify(o)).toString('base64url')}
  const now=Math.floor(Date.now()/1000)
  const data=b64({alg:'HS256',typ:'JWT'})+'.'+b64({aud:'authenticated',role:'authenticated',sub:uid,exp:now+3600,iat:now})
  const sig=crypto.createHmac('sha256',process.env.SUPABASE_JWT_SECRET).update(data).digest('base64url')
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {global:{headers:{Authorization:`Bearer ${data+'.'+sig}`}}})}
const eng=mk('da39a908-d438-41d8-9918-4272ddfe8f87')

// Fixed entries query
const { data: entries, error: eerr } = await eng.from('calendar_entries').select(
 `id, entry_type_id, user_id, start_at, end_at, all_day,
   entry_type:calendar_entry_types(name),
   user:profiles!calendar_entries_user_id_fkey(id, full_name),
   attendees:calendar_entry_attendees(user:profiles(id, full_name))`).order('start_at')
console.log('FIXED entries query => rows:', entries?.length, 'err:', eerr?.message||'none')

// Tasks
const { data: tasks } = await eng.from('tasks').select(`id,scheduled_date,booked_start_time,status,started_at,booked_duration_minutes,task_results(testing_start_time)`).or('scheduled_date.not.is.null,status.eq.completed,status.eq.in_progress').neq('status','cancelled')
const items=[]
for (const t of tasks) {
  const trs=Array.isArray(t.task_results)?t.task_results:(t.task_results?[t.task_results]:[])
  const result=trs.find(r=>r.testing_start_time)
  const hasSlot=!!t.booked_start_time&&!!t.scheduled_date
  const hasActual=!!result?.testing_start_time
  const hasCommenced=t.status==='in_progress'&&!!t.started_at
  let day
  if(hasSlot) day=t.scheduled_date
  else if(hasCommenced) day=t.started_at.slice(0,10)
  else if(hasActual) day=result.testing_start_time.slice(0,10)
  else if(t.scheduled_date) day=t.scheduled_date
  else {continue}
  items.push({id:t.id.slice(0,8),status:t.status,day})
}
const completed=items.filter(i=>i.status==='completed')
console.log('\ntask items total:',items.length,' completed items on calendar:',completed.length)
console.log('completed task days:', completed.map(c=>c.day).sort().join(', '))
