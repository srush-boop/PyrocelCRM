import { get } from '@vercel/blob'
import * as XLSX from 'xlsx'

const pathname = 'product-sheets/PRODUCTS-XE86smKpbZXwKAgFjygbDDtlctWfPJ.xlsx'

const result = await get(pathname, { access: 'private' })
const chunks = []
for await (const chunk of result.stream) {
  chunks.push(Buffer.from(chunk))
}
const buf = Buffer.concat(chunks)
console.log('[v0] bytes:', buf.length)
const wb = XLSX.read(buf, { type: 'buffer' })
console.log('[v0] sheet names:', wb.SheetNames)
const ws = wb.Sheets[wb.SheetNames[0]]
const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' })
console.log('[v0] total rows:', rows.length)
for (let i = 0; i < Math.min(15, rows.length); i++) {
  console.log(`[v0] row ${i}:`, JSON.stringify(rows[i]))
}
