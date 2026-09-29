// One-off migration: add service_types.client_signature_mode.
//
// Per-service-type control over the on-site client signature:
//   'required' — card shown; no signature means the engineer must give a reason
//   'optional' — card shown; can close without a signature or reason
//   'none'     — card not shown
//   NULL       — default: required for non-recurring calls, none for recurring
//
// Run: node --env-file-if-exists=/vercel/share/.env.project scripts/add-service-type-client-signature-mode.mjs
import pg from 'pg'

const url = process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL
if (!url) {
  console.error('[v0] No POSTGRES_URL(_NON_POOLING) in env')
  process.exit(1)
}

const clean = url.replace(/[?&]sslmode=[^&]*/g, '')
const client = new pg.Client({ connectionString: clean, ssl: { rejectUnauthorized: false } })

async function main() {
  await client.connect()
  await client.query(`
    ALTER TABLE service_types
    ADD COLUMN IF NOT EXISTS client_signature_mode text
  `)
  await client.query(`
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'service_types_client_signature_mode_check'
      ) THEN
        ALTER TABLE service_types
          ADD CONSTRAINT service_types_client_signature_mode_check
          CHECK (client_signature_mode IS NULL OR client_signature_mode IN ('required','optional','none'));
      END IF;
    END $$;
  `)
  console.log('[v0] client_signature_mode column ensured (NULL = default by call kind)')
  await client.end()
}

main().catch((err) => {
  console.error('[v0] migration failed:', err)
  process.exit(1)
})
