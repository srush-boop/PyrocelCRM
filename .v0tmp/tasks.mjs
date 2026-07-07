import { createClient } from '@supabase/supabase-js'
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const { data: tasks } = await sb.from('tasks').select('id,scheduled_date,status,started_at,booked_start_time,booked_end_time,booked_duration_minutes,assigned_engineer_id').or('status.eq.completed,status.eq.in_progress')
console.log('completed/in_progress tasks:', tasks?.length)
console.log(JSON.stringify(tasks,null,1))
if (tasks?.length) {
  const ids = tasks.map(t=>t.id)
  const { data: tr } = await sb.from('task_results').select('task_id,testing_start_time,testing_end_time').in('task_id', ids)
  console.log('\ntask_results:', JSON.stringify(tr,null,1))
}
