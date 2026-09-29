import pg from 'pg'

const PALETTE = ['#2563eb', '#dc2626', '#16a34a', '#d97706', '#9333ea', '#0891b2', '#db2777', '#65a30d', '#475569', '#ea580c']

const client = new pg.Client({
  connectionString: process.env.POSTGRES_URL_NON_POOLING.replace(/[?&]sslmode=[^&]*/, ''),
  ssl: { rejectUnauthorized: false },
})
await client.connect()
try {
  const { rows } = await client.query('select id, name, color from areas order by name')
  const counts = new Map(PALETTE.map((c) => [c, 0]))
  const seen = new Set()
  for (const area of rows) {
    let color = area.color
    if (!color || seen.has(color)) {
      color = PALETTE.reduce((best, c) => (counts.get(c) < counts.get(best) ? c : best), PALETTE[0])
      await client.query('update areas set color = $1 where id = $2', [color, area.id])
      console.log(`[v0] ${area.name}: ${area.color} -> ${color}`)
    }
    seen.add(color)
    counts.set(color, (counts.get(color) ?? 0) + 1)
  }
} finally {
  await client.end()
}
