import { createClient } from '@supabase/supabase-js'
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const { data: authList } = await sb.auth.admin.listUsers({ page:1, perPage:1000 })
const { data: profs } = await sb.from('profiles').select('id,email,full_name,role')
const pids = new Set(profs.map(p=>p.id))
console.log('AUTH USERS (13):')
for (const u of authList.users) {
  const hasProfile = pids.has(u.id)
  console.log(` ${hasProfile?'   ':'ORPHAN'} ${u.email}\t${u.id}\t${u.created_at}`)
}
console.log('\nPROFILES without auth user:')
const auids=new Set(authList.users.map(u=>u.id))
profs.filter(p=>!auids.has(p.id)).forEach(p=>console.log(` ${p.email} ${p.full_name} ${p.id}`))

// Check any references to the orphan id across likely FK tables
const OID='53f23aab-0600-4a49-aaeb-fbf364461f8d'
for (const tbl of ['calendar_entries','calendar_entry_attendees','tasks','quotes','leave_requests','notifications']) {
  for (const col of ['user_id','assigned_engineer_id','created_by','approved_by','requested_by']) {
    const { count, error } = await sb.from(tbl).select('*',{count:'exact',head:true}).eq(col, OID)
    if(!error && count>0) console.log(`REF ${tbl}.${col} = ${count}`)
  }
}
console.log('done ref scan')
