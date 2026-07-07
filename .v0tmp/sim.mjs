import { createClient } from '@supabase/supabase-js'
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const { data: tasks } = await sb.from('tasks').select(`id,scheduled_date,booked_start_time,booked_end_time,booked_duration_minutes,status,started_at,task_results(testing_start_time,testing_end_time)`).or('scheduled_date.not.is.null,status.eq.completed,status.eq.in_progress').neq('status','cancelled').eq('status','completed')
console.log('completed tasks:', tasks.length)
for (const t of tasks) {
  const trs = Array.isArray(t.task_results)?t.task_results:(t.task_results?[t.task_results]:[])
  const result = trs.find(r=>r.testing_start_time)
  const hasSlot = !!t.booked_start_time && !!t.scheduled_date
  const hasActual = !!result?.testing_start_time
  let placement
  if (hasSlot) placement='slot @ '+t.scheduled_date
  else if (hasActual) placement='ACTUAL @ '+result.testing_start_time
  else if (t.scheduled_date) placement='allday @ '+t.scheduled_date
  else placement='*** DROPPED (no anchor) ***'
  console.log(` ${t.id.slice(0,8)} sched=${t.scheduled_date} booked=${t.booked_start_time} actual=${result?.testing_start_time||'none'} => ${placement}`)
}
