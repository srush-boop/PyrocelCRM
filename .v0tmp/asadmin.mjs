import { createClient } from '@supabase/supabase-js'
import crypto from 'node:crypto'
const svc = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const { data: profiles } = await svc.from('profiles').select('id,full_name,email,role,branch_id').order('role')
console.log('PROFILES:'); profiles.forEach(p=>console.log(` ${p.role}\t${p.full_name||p.email}\t${p.id}\tbranch=${p.branch_id}`))
const admin = profiles.find(p=>p.role==='admin')
if(!admin){console.log('no admin');process.exit(0)}

// Forge an authenticated JWT (HS256) for this user
function b64(o){return Buffer.from(JSON.stringify(o)).toString('base64url')}
const now=Math.floor(Date.now()/1000)
const payload={aud:'authenticated',role:'authenticated',sub:admin.id,exp:now+3600,iat:now,email:admin.email}
const head={alg:'HS256',typ:'JWT'}
const data=b64(head)+'.'+b64(payload)
const sig=crypto.createHmac('sha256',process.env.SUPABASE_JWT_SECRET).update(data).digest('base64url')
const token=data+'.'+sig

const asUser=createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {global:{headers:{Authorization:`Bearer ${token}`}}})
const BANK='73267195-2ba7-423b-b642-bc040dcb1840'
const { data: ent, error: e1 } = await asUser.from('calendar_entries').select('id,entry_type_id,all_day').neq('entry_type_id',BANK)
console.log('\n[as admin] non-bank calendar_entries visible:', ent?.length, e1?.message||'')
const { data: allEnt } = await asUser.from('calendar_entries').select('id')
console.log('[as admin] ALL calendar_entries visible:', allEnt?.length)
const { data: tk, error: e2 } = await asUser.from('tasks').select('id,status').or('status.eq.completed,status.eq.in_progress')
console.log('[as admin] completed/in_progress tasks visible:', tk?.length, e2?.message||'')
