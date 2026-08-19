import crypto from 'node:crypto'

function base32Decode(s) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  let bits = ''
  for (const c of s.replace(/=+$/, '').toUpperCase()) {
    const idx = alphabet.indexOf(c)
    if (idx === -1) continue
    bits += idx.toString(2).padStart(5, '0')
  }
  const bytes = []
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2))
  return Buffer.from(bytes)
}

const secret = process.argv[2]
const key = base32Decode(secret)
const counter = Math.floor(Date.now() / 1000 / 30)
const buf = Buffer.alloc(8)
buf.writeUInt32BE(counter, 4)
const hmac = crypto.createHmac('sha1', key).update(buf).digest()
const offset = hmac[hmac.length - 1] & 0xf
const code = ((hmac.readUInt32BE(offset) & 0x7fffffff) % 1000000).toString().padStart(6, '0')
console.log(code)
