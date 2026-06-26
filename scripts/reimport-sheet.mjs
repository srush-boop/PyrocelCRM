import { get } from '@vercel/blob'
import * as XLSX from 'xlsx'
import { createClient } from '@supabase/supabase-js'

const PATHNAME = 'product-sheets/PRODUCTS-XE86smKpbZXwKAgFjygbDDtlctWfPJ.xlsx'

function normalizeKey(s) {
  return String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')
}

const FIELD_ALIASES = {
  name: ['name', 'productname', 'itemname', 'item', 'title', 'description'],
  productCode: ['productcode', 'code', 'sku', 'partnumber', 'partno', 'itemcode', 'stockcode'],
  description: ['specificationtext', 'spectext', 'specification', 'longdescription', 'details', 'notes', 'desc', 'description'],
  category: ['category', 'group', 'producttype', 'systemtype'],
  unit: ['unit', 'uom', 'unitofmeasure', 'measure'],
  price: ['standardcostprice', 'costprice', 'unitcost', 'cost', 'buyprice', 'unitprice', 'sellprice', 'listprice', 'price', 'rate'],
}

function pickColumn(headerKeys, aliases, taken = []) {
  for (const alias of aliases) {
    for (let i = 0; i < headerKeys.length; i++) {
      if (!taken.includes(i) && headerKeys[i] === alias) return i
    }
  }
  for (const alias of aliases) {
    for (let i = 0; i < headerKeys.length; i++) {
      if (!taken.includes(i) && headerKeys[i] && headerKeys[i].includes(alias)) return i
    }
  }
  return -1
}

function cell(row, idx) {
  if (idx === -1) return ''
  return String(row[idx] ?? '').trim()
}

function parsePrice(v) {
  if (v == null || v === '') return 0
  const n = typeof v === 'number' ? v : Number(String(v).replace(/[^0-9.\-]/g, ''))
  if (!Number.isFinite(n)) return 0
  return Math.round(n * 100)
}

const blob = await get(PATHNAME, { access: 'private' })
const chunks = []
for await (const c of blob.stream()) chunks.push(c)
const buf = Buffer.concat(chunks)
const wb = XLSX.read(buf, { type: 'buffer' })
const ws = wb.Sheets[wb.SheetNames[0]]
const rows = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false })

const header = rows[0]
const headerKeys = header.map(normalizeKey)
const nameCol = pickColumn(headerKeys, FIELD_ALIASES.name)
const codeCol = pickColumn(headerKeys, FIELD_ALIASES.productCode, [nameCol])
const descCol = pickColumn(headerKeys, FIELD_ALIASES.description, [nameCol, codeCol])
const catCol = pickColumn(headerKeys, FIELD_ALIASES.category, [nameCol, codeCol, descCol])
const unitCol = pickColumn(headerKeys, FIELD_ALIASES.unit, [nameCol, codeCol, descCol, catCol])
const priceCol = pickColumn(headerKeys, FIELD_ALIASES.price, [nameCol, codeCol, descCol, catCol, unitCol])

console.log('[v0] header:', header)
console.log('[v0] cols name/code/desc/cat/unit/price:', nameCol, codeCol, descCol, catCol, unitCol, priceCol)

const seen = new Set()
const records = []
for (let i = 1; i < rows.length; i++) {
  const row = rows[i]
  const name = cell(row, nameCol)
  if (!name) continue
  const code = codeCol !== -1 ? cell(row, codeCol) || null : null
  const dedupKey = (code ? 'c:' + code.toLowerCase() : 'n:' + name.toLowerCase())
  if (seen.has(dedupKey)) continue
  seen.add(dedupKey)
  const cost = priceCol !== -1 ? parsePrice(row[priceCol]) : 0
  records.push({
    name,
    product_code: code,
    description: descCol !== -1 ? cell(row, descCol) || null : null,
    category: catCol !== -1 ? cell(row, catCol) || null : null,
    default_unit: unitCol !== -1 ? cell(row, unitCol) || null : null,
    unit_cost_pence: cost,
    margin_percent: 0,
    default_unit_price_pence: cost,
    active: true,
  })
}

console.log('[v0] parsed records:', records.length)
console.log('[v0] sample:', JSON.stringify(records.slice(0, 3), null, 2))

const supabase = createClient(
  process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
)

// Replace catalogue (no line items reference it).
const { error: delErr } = await supabase
  .from('quote_catalogue_items')
  .delete()
  .neq('id', '00000000-0000-0000-0000-000000000000')
if (delErr) {
  console.error('[v0] delete error:', delErr)
  process.exit(1)
}

let inserted = 0
for (let i = 0; i < records.length; i += 500) {
  const batch = records.slice(i, i + 500)
  const { error } = await supabase.from('quote_catalogue_items').insert(batch)
  if (error) {
    console.error('[v0] insert error at', i, error)
    process.exit(1)
  }
  inserted += batch.length
  console.log('[v0] inserted', inserted, '/', records.length)
}

console.log('[v0] DONE inserted', inserted)
