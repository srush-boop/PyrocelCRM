import pg from 'pg'

const rawUrl =
  process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL || process.env.DATABASE_URL || ''
const connectionString = rawUrl.replace(/([?&])sslmode=[^&]+/, '$1').replace(/[?&]$/, '')

const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } })

async function main() {
  await client.connect()

  // 1. Profiles: role + discipline breakdown
  console.log('=== Profiles by role + discipline ===')
  const { rows: roleRows } = await client.query(`
    SELECT role, discipline, count(*)::int AS n
    FROM profiles
    GROUP BY role, discipline
    ORDER BY role, discipline
  `)
  for (const r of roleRows) {
    console.log(`  role=${r.role ?? 'null'}  discipline=${r.discipline ?? 'null'}  → ${r.n}`)
  }

  // 2. Anyone who looks like a CDO (name/email/discipline)
  console.log('\n=== Accounts that look CDO-related ===')
  const { rows: cdoLike } = await client.query(`
    SELECT id, full_name, email, role, discipline, status
    FROM profiles
    WHERE discipline = 'cdo'
       OR lower(full_name) LIKE '%cdo%'
       OR lower(email) LIKE '%cdo%'
    ORDER BY full_name
  `)
  for (const r of cdoLike) {
    console.log(
      `  ${r.full_name ?? '(no name)'} <${r.email}>  role=${r.role} discipline=${r.discipline ?? 'null'} status=${r.status}`,
    )
  }
  if (cdoLike.length === 0) console.log('  (none found)')

  // 3. Routes overview
  console.log('\n=== Routes ===')
  const { rows: routes } = await client.query(`
    SELECT r.id, r.name, r.day_of_week, r.assigned_engineer_id,
           p.full_name AS engineer, p.discipline AS eng_discipline,
           (SELECT count(*)::int FROM sites s WHERE s.route_id = r.id) AS site_count
    FROM routes r
    LEFT JOIN profiles p ON p.id = r.assigned_engineer_id
    ORDER BY r.name
  `)
  for (const r of routes) {
    console.log(
      `  "${r.name}" day_of_week=${r.day_of_week ?? 'null'} sites=${r.site_count} engineer=${r.engineer ?? 'UNASSIGNED'}${r.engineer ? ` (discipline=${r.eng_discipline ?? 'null'})` : ''}`,
    )
  }
  if (routes.length === 0) console.log('  (no routes)')

  // 4. Sites with/without a route
  const { rows: siteRoute } = await client.query(`
    SELECT
      count(*) FILTER (WHERE route_id IS NOT NULL)::int AS with_route,
      count(*) FILTER (WHERE route_id IS NULL)::int AS without_route
    FROM sites
  `)
  console.log(`\n=== Sites: ${siteRoute[0].with_route} on a route, ${siteRoute[0].without_route} without ===`)

  // 5. For each CDO-discipline engineer: open calls + how many are route-backed
  console.log('\n=== Open calls per CDO engineer (pending/in_progress/paused) ===')
  const { rows: cdoEngineers } = await client.query(`
    SELECT id, full_name, email FROM profiles WHERE discipline = 'cdo' AND role IN ('engineer','subcontractor')
  `)
  if (cdoEngineers.length === 0) {
    console.log('  (no engineer/subcontractor accounts have discipline=cdo)')
  }
  for (const eng of cdoEngineers) {
    const { rows: t } = await client.query(
      `
      SELECT
        count(*)::int AS total_open,
        count(*) FILTER (WHERE s.route_id IS NOT NULL)::int AS on_route
      FROM tasks tk
      LEFT JOIN site_services ss ON ss.id = tk.site_service_id
      LEFT JOIN sites s ON s.id = COALESCE(ss.site_id, tk.site_id)
      WHERE tk.assigned_engineer_id = $1
        AND tk.status IN ('pending','in_progress','paused')
      `,
      [eng.id],
    )
    console.log(`  ${eng.full_name} <${eng.email}>: ${t[0].total_open} open, ${t[0].on_route} on a route`)
  }

  // 6. Distribution of open CDO-type calls (worker_type=cdo) across engineers/disciplines
  console.log('\n=== Open calls whose service worker_type = cdo, by assignee discipline ===')
  const { rows: cdoCalls } = await client.query(`
    SELECT COALESCE(p.discipline,'(unassigned/null)') AS discipline,
           COALESCE(p.full_name,'(unassigned)') AS engineer,
           count(*)::int AS n
    FROM tasks tk
    LEFT JOIN site_services ss ON ss.id = tk.site_service_id
    LEFT JOIN service_types st ON st.id = ss.service_type_id
    LEFT JOIN profiles p ON p.id = tk.assigned_engineer_id
    WHERE tk.status IN ('pending','in_progress','paused')
      AND st.default_worker_type = 'cdo'
    GROUP BY p.discipline, p.full_name
    ORDER BY n DESC
  `)
  for (const r of cdoCalls) {
    console.log(`  ${r.engineer} (discipline=${r.discipline}): ${r.n}`)
  }
  if (cdoCalls.length === 0) console.log('  (no open CDO-type calls)')

  await client.end()
}

main().catch((e) => {
  console.error('ERROR:', e.message)
  process.exit(1)
})
