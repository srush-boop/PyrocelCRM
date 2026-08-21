import pg from 'pg'

/**
 * Employee Vault document folders.
 *
 * Adds two tables so admins can attach a folder of downloadable documentation
 * inside each vault section:
 *   - vault_folders    — a named folder belonging to a vault_sections row
 *   - vault_documents  — an uploaded file (private Blob) belonging to a folder
 *
 * Visibility INHERITS the parent section's `visible_roles`: whoever can already
 * see the section can see its folders + documents. Only admins may create,
 * upload, rename or delete (RLS `is_admin()` on write, mirroring vault_sections).
 */
const { Client } = pg

// Supabase's pooled URL includes sslmode=require which node-postgres' verify-full
// rejects against the self-signed chain; strip it and disable strict verify.
const rawUrl =
  process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL || process.env.DATABASE_URL || ''
if (!rawUrl) {
  console.error('No POSTGRES_URL / DATABASE_URL in environment')
  process.exit(1)
}
const connectionString = rawUrl.replace(/[?&]sslmode=[^&]+/, '')

const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } })

async function main() {
  await client.connect()

  await client.query(`
    CREATE TABLE IF NOT EXISTS vault_folders (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      section_id uuid NOT NULL REFERENCES vault_sections(id) ON DELETE CASCADE,
      name text NOT NULL,
      description text,
      sort_order integer NOT NULL DEFAULT 0,
      created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS vault_folders_section_idx ON vault_folders(section_id);
  `)

  await client.query(`
    CREATE TABLE IF NOT EXISTS vault_documents (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      folder_id uuid NOT NULL REFERENCES vault_folders(id) ON DELETE CASCADE,
      name text NOT NULL,
      description text,
      blob_pathname text NOT NULL,
      blob_url text,
      content_type text,
      size_bytes bigint,
      uploaded_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS vault_documents_folder_idx ON vault_documents(folder_id);
  `)

  // --- RLS -------------------------------------------------------------
  await client.query(`ALTER TABLE vault_folders ENABLE ROW LEVEL SECURITY;`)
  await client.query(`ALTER TABLE vault_documents ENABLE ROW LEVEL SECURITY;`)

  // Folders: admins do everything; staff read a folder iff its section is
  // visible to their role (mirrors vault_sections_select).
  await client.query(`DROP POLICY IF EXISTS vault_folders_modify ON vault_folders;`)
  await client.query(`
    CREATE POLICY vault_folders_modify ON vault_folders
      FOR ALL USING (is_admin()) WITH CHECK (is_admin());
  `)
  await client.query(`DROP POLICY IF EXISTS vault_folders_select ON vault_folders;`)
  await client.query(`
    CREATE POLICY vault_folders_select ON vault_folders
      FOR SELECT USING (
        is_admin() OR (
          is_staff() AND EXISTS (
            SELECT 1 FROM vault_sections s
            JOIN profiles p ON p.id = auth.uid()
            WHERE s.id = vault_folders.section_id
              AND p.role = ANY (s.visible_roles)
          )
        )
      );
  `)

  // Documents: admins do everything; staff read a document iff the folder's
  // section is visible to their role.
  await client.query(`DROP POLICY IF EXISTS vault_documents_modify ON vault_documents;`)
  await client.query(`
    CREATE POLICY vault_documents_modify ON vault_documents
      FOR ALL USING (is_admin()) WITH CHECK (is_admin());
  `)
  await client.query(`DROP POLICY IF EXISTS vault_documents_select ON vault_documents;`)
  await client.query(`
    CREATE POLICY vault_documents_select ON vault_documents
      FOR SELECT USING (
        is_admin() OR (
          is_staff() AND EXISTS (
            SELECT 1 FROM vault_folders f
            JOIN vault_sections s ON s.id = f.section_id
            JOIN profiles p ON p.id = auth.uid()
            WHERE f.id = vault_documents.folder_id
              AND p.role = ANY (s.visible_roles)
          )
        )
      );
  `)

  console.log('vault_folders + vault_documents tables and RLS ensured.')
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(() => client.end())
