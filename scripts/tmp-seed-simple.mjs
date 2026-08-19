import { createClient } from '@supabase/supabase-js'
import crypto from 'node:crypto'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const service = process.env.SUPABASE_SERVICE_ROLE_KEY
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

const admin = createClient(url, service, { auth: { persistSession: false } })

const email = 'simple-test@pyrocel.test'
const password = 'SimpleTest12345!'

// base32 decode + TOTP (SHA1, 6 digits, 30s)
function b32decode(s) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  let bits = ''
  for (const c of s.replace(/=+$/, '').toUpperCase()) {
    const v = alphabet.indexOf(c)
    if (v < 0) continue
    bits += v.toString(2).padStart(5, '0')
  }
  const bytes = []
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2))
  return Buffer.from(bytes)
}
function totp(secret, t = Date.now()) {
  const key = b32decode(secret)
  const counter = Math.floor(t / 1000 / 30)
  const buf = Buffer.alloc(8)
  buf.writeBigInt64BE(BigInt(counter))
  const hmac = crypto.createHmac('sha1', key).update(buf).digest()
  const off = hmac[hmac.length - 1] & 0xf
  const code = ((hmac[off] & 0x7f) << 24) | (hmac[off + 1] << 16) | (hmac[off + 2] << 8) | hmac[off + 3]
  return (code % 1000000).toString().padStart(6, '0')
}

// 1. Create the auth user (idempotent-ish: ignore "already registered").
let userId
const created = await admin.auth.admin.createUser({ email, password, email_confirm: true })
if (created.error) {
  if (!/already/i.test(created.error.message)) throw created.error
  const list = await admin.auth.admin.listUsers()
  userId = list.data.users.find((u) => u.email === email)?.id
} else {
  userId = created.data.user.id
}
console.log('USER_ID', userId)

// 2. Promote profile to an active, onboarded office user with full menu access.
const up = await admin
  .from('profiles')
  .update({
    role: 'office',
    status: 'active',
    full_name: 'Simple Test',
    onboarded_at: new Date().toISOString(),
    must_change_password: false,
    menu_permissions: null,
  })
  .eq('id', userId)
if (up.error) throw up.error
console.log('PROFILE_UPDATED')

// 3. Enroll + verify a TOTP factor via a real user session.
const user = createClient(url, anon, { auth: { persistSession: false } })
const si = await user.auth.signInWithPassword({ email, password })
if (si.error) throw si.error

// Clear any half-enrolled factors first.
const existing = await user.auth.mfa.listFactors()
for (const f of existing.data?.all ?? []) {
  await user.auth.mfa.unenroll({ factorId: f.id })
}

const enroll = await user.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'test-' + Date.now() })
if (enroll.error) throw enroll.error
const factorId = enroll.data.id
const secret = enroll.data.totp.secret

const challenge = await user.auth.mfa.challenge({ factorId })
if (challenge.error) throw challenge.error
const verify = await user.auth.mfa.verify({
  factorId,
  challengeId: challenge.data.id,
  code: totp(secret),
})
if (verify.error) throw verify.error

console.log('SECRET', secret)
console.log('EMAIL', email)
console.log('PASSWORD', password)
console.log('CODE_NOW', totp(secret))
