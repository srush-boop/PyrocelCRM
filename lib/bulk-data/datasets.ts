/**
 * Central registry for the Settings → Data bulk download/upload feature.
 *
 * Each dataset maps a spreadsheet (human-friendly headers) to a database table.
 * The registry is the single source of truth shared by:
 *   - the client UI (which headers to show, template generation, preview)
 *   - the server actions (validation, transforms, upsert field mapping)
 *
 * This module is pure/shared — no 'use server' or 'use client' — so it can be
 * imported from both sides.
 */

/** How a spreadsheet column maps to / from the database. */
export type ColumnKind =
  | 'text'
  | 'integer'
  | 'number' // decimal stored as-is (e.g. numeric pounds, percentages)
  | 'money_gbp' // shown in £ in the sheet, stored as integer pence in the DB
  | 'boolean'
  | 'enum' // constrained to a fixed set of DB values (e.g. a status check constraint)
  | 'fk_name' // shown as a human name in the sheet, stored as a resolved uuid

export interface ForeignKeyConfig {
  /** Referenced table, e.g. 'clients'. */
  table: string
  /** Column on the referenced table to match the sheet value against, e.g. 'name'. */
  matchColumn: string
  /** Human label used in warnings, e.g. 'client'. */
  label: string
}

export interface ColumnSpec {
  /** Header shown in the spreadsheet. */
  header: string
  /** Database column this maps to. */
  field: string
  kind: ColumnKind
  /** Required for a valid row (only enforced for the columns without DB defaults). */
  required?: boolean
  /** For fk_name columns: how to resolve the name to an id. */
  fk?: ForeignKeyConfig
  /** For enum columns: the canonical DB values accepted (matched case-insensitively). */
  enumValues?: string[]
  /** For enum columns: alias -> canonical map (keys lowercased), e.g. UI labels. */
  enumAliases?: Record<string, string>
  /** Example value shown in the blank template's sample row. */
  example?: string | number | boolean
  /** Optional helper note shown under the dataset. */
  note?: string
}

export interface DatasetDef {
  key: string
  label: string
  table: string
  description: string
  /** The id column (uuid) used as the primary merge key. Always exported hidden-ish first. */
  idField: string
  columns: ColumnSpec[]
  /**
   * Fallback merge key when a row has no id. Either a single db field (e.g. 'name'
   * or 'sku') or a set of fields forming a composite key (e.g. stock location+part).
   */
  naturalKey?: string
  naturalKeyFields?: string[]
  /** List pages to revalidate after a successful merge. */
  revalidate: string[]
}

export const ID_HEADER = 'id'

export const DATASETS: DatasetDef[] = [
  {
    key: 'clients',
    label: 'Clients',
    table: 'clients',
    description: 'Client companies and their primary contact details.',
    idField: 'id',
    naturalKey: 'name',
    revalidate: ['/dashboard/clients'],
    columns: [
      { header: 'name', field: 'name', kind: 'text', required: true, example: 'Acme Property Group' },
      { header: 'contact_name', field: 'contact_name', kind: 'text', example: 'Jane Smith' },
      { header: 'contact_email', field: 'contact_email', kind: 'text', example: 'jane@acme.co.uk' },
      { header: 'contact_phone', field: 'contact_phone', kind: 'text', example: '020 7946 0000' },
      { header: 'address', field: 'address', kind: 'text', example: '1 High Street, London' },
      {
        header: 'status',
        field: 'status',
        kind: 'enum',
        enumValues: ['live', 'new', 'dead'],
        // Accept the UI-facing labels too (Active/Engaged/Dormant), any casing.
        enumAliases: { active: 'live', engaged: 'new', dormant: 'dead' },
        example: 'live',
        note: "'live' (Active), 'new' (Engaged) or 'dead' (Dormant).",
      },
      { header: 'requires_po', field: 'requires_po', kind: 'boolean', example: false, note: 'Whether a PO is required before invoicing.' },
      { header: 'po_number', field: 'po_number', kind: 'text', note: 'Standing/blanket PO number, if any.' },
      { header: 'invoice_calls_individually', field: 'invoice_calls_individually', kind: 'boolean', example: false },
      { header: 'login_tagline', field: 'login_tagline', kind: 'text', note: 'Optional tagline on the client portal login.' },
      { header: 'notes', field: 'notes', kind: 'text' },
    ],
  },
  {
    key: 'sites',
    label: 'Sites',
    table: 'sites',
    description: 'Sites / premises. Link to a client by the exact client name.',
    idField: 'id',
    naturalKey: 'name',
    revalidate: ['/dashboard/sites'],
    columns: [
      { header: 'name', field: 'name', kind: 'text', required: true, example: 'Acme HQ' },
      {
        header: 'client',
        field: 'client_id',
        kind: 'fk_name',
        fk: { table: 'clients', matchColumn: 'name', label: 'client' },
        example: 'Acme Property Group',
        note: 'Must match an existing client name exactly.',
      },
      { header: 'address', field: 'address', kind: 'text', required: true, example: '1 High Street, London' },
      { header: 'postcode', field: 'postcode', kind: 'text', example: 'EC1A 1BB' },
      { header: 'uprn', field: 'uprn', kind: 'text', note: 'Unique Property Reference Number.' },
      { header: 'site_ref', field: 'site_id_cash', kind: 'text', note: 'External / accounts site reference.' },
      { header: 'contact_name', field: 'contact_name', kind: 'text' },
      { header: 'contact_email', field: 'contact_email', kind: 'text' },
      { header: 'contact_phone', field: 'contact_phone', kind: 'text' },
      {
        header: 'status',
        field: 'status',
        kind: 'enum',
        enumValues: ['live', 'new', 'dead'],
        // Accept the UI-facing labels too (Active/Engaged/Dormant), any casing.
        enumAliases: { active: 'live', engaged: 'new', dormant: 'dead' },
        example: 'live',
        note: "'live' (Active), 'new' (Engaged) or 'dead' (Dormant).",
      },
      {
        header: 'branch',
        field: 'branch_id',
        kind: 'fk_name',
        fk: { table: 'branches', matchColumn: 'name', label: 'branch' },
        note: 'Optional. Must match an existing branch name.',
      },
      {
        header: 'property_type',
        field: 'property_type_id',
        kind: 'fk_name',
        fk: { table: 'property_types', matchColumn: 'name', label: 'property type' },
        note: 'Optional. Must match an existing property type name.',
      },
      {
        header: 'route',
        field: 'route_id',
        kind: 'fk_name',
        fk: { table: 'routes', matchColumn: 'name', label: 'route' },
        note: 'Optional. Must match an existing route name.',
      },
      { header: 'route_position', field: 'route_position', kind: 'integer', note: 'Order of this site within its route.' },
      {
        header: 'billing_account',
        field: 'billing_account_id',
        kind: 'fk_name',
        fk: { table: 'billing_accounts', matchColumn: 'name', label: 'billing account' },
        note: 'Optional. Must match an existing billing account name.',
      },
      {
        header: 'rate_card',
        field: 'rate_card_id',
        kind: 'fk_name',
        fk: { table: 'rate_cards', matchColumn: 'name', label: 'rate card' },
        note: 'Optional. Must match an existing rate card name.',
      },
      { header: 'po_number', field: 'po_number', kind: 'text', note: 'Standing/blanket PO number for this site.' },
      { header: 'authorised_works_limit_gbp', field: 'authorised_works_limit_pence', kind: 'money_gbp', note: 'Pre-authorised remedial works limit in £.' },
      { header: 'authorised_works_po', field: 'authorised_works_po', kind: 'text' },
      { header: 'has_remote_monitoring', field: 'has_remote_monitoring', kind: 'boolean', example: false },
      { header: 'monitoring_station_name', field: 'monitoring_station_name', kind: 'text' },
      { header: 'monitoring_station_phone', field: 'monitoring_station_phone', kind: 'text' },
      { header: 'monitoring_station_url', field: 'monitoring_station_url', kind: 'text' },
      { header: 'booking_required', field: 'booking_required', kind: 'boolean', example: false },
      { header: 'access_required', field: 'access_required', kind: 'boolean', example: false },
      { header: 'keys_required', field: 'keys_required', kind: 'boolean', example: false },
      { header: 'two_engineers_required', field: 'two_engineers_required', kind: 'boolean', example: false },
      // NOTE: `remedial_required` is intentionally NOT importable/exportable. It
      // is a derived flag, set automatically when a site/service has an open
      // remedial call (see lib/site-flags.ts `remedialOpen`), not a manual
      // setup field. `remedial_notes` below is a genuine pre-attendance field.
      { header: 'remedial_notes', field: 'remedial_notes', kind: 'text' },
      { header: 'notes', field: 'notes', kind: 'text' },
    ],
  },
  {
    key: 'suppliers',
    label: 'Suppliers',
    table: 'suppliers',
    description: 'Supplier companies, contact and ordering details.',
    idField: 'id',
    naturalKey: 'name',
    revalidate: ['/dashboard/suppliers'],
    columns: [
      { header: 'name', field: 'name', kind: 'text', required: true, example: 'Fire Parts Ltd' },
      { header: 'supplier_type', field: 'supplier_type', kind: 'text', example: 'parts', note: "e.g. 'parts', 'equipment', 'subcontractor'." },
      { header: 'contact_name', field: 'contact_name', kind: 'text' },
      { header: 'contact_email', field: 'contact_email', kind: 'text' },
      { header: 'contact_phone', field: 'contact_phone', kind: 'text' },
      { header: 'order_email', field: 'order_email', kind: 'text' },
      { header: 'website', field: 'website', kind: 'text' },
      { header: 'account_number', field: 'account_number', kind: 'text' },
      { header: 'address', field: 'address', kind: 'text' },
      { header: 'portal_url', field: 'portal_url', kind: 'text', note: 'Ordering portal login URL.' },
      { header: 'portal_username', field: 'portal_username', kind: 'text' },
      { header: 'portal_password', field: 'portal_password', kind: 'text' },
      {
        header: 'status',
        field: 'status',
        kind: 'enum',
        enumValues: ['active', 'inactive'],
        example: 'active',
        note: "'active' or 'inactive'.",
      },
      { header: 'notes', field: 'notes', kind: 'text' },
    ],
  },
  {
    key: 'quote_catalogue_items',
    label: 'Quote catalogue items',
    table: 'quote_catalogue_items',
    description: 'Parts and services available in the quote builder. Prices are in pounds (£).',
    idField: 'id',
    naturalKey: 'name',
    revalidate: ['/dashboard/settings'],
    columns: [
      { header: 'name', field: 'name', kind: 'text', required: true, example: 'Optical smoke detector' },
      { header: 'description', field: 'description', kind: 'text' },
      { header: 'category', field: 'category', kind: 'text', example: 'Detection' },
      { header: 'product_code', field: 'product_code', kind: 'text', example: 'OSD-100' },
      { header: 'default_unit', field: 'default_unit', kind: 'text', example: 'each' },
      { header: 'unit_cost_gbp', field: 'unit_cost_pence', kind: 'money_gbp', example: 18.5, note: 'Cost price in £.' },
      { header: 'unit_price_gbp', field: 'default_unit_price_pence', kind: 'money_gbp', example: 32.0, note: 'Sell price in £.' },
      { header: 'service_sale_price_gbp', field: 'service_sale_price_pence', kind: 'money_gbp', example: 40.0, note: 'Sale price when used on a service, in £.' },
      { header: 'ecommerce_price_gbp', field: 'ecommerce_price_pence', kind: 'money_gbp', example: 45.0, note: 'Online store price in £.' },
      { header: 'margin_percent', field: 'margin_percent', kind: 'number', example: 42 },
      {
        header: 'manufacturer',
        field: 'manufacturer_id',
        kind: 'fk_name',
        fk: { table: 'quote_manufacturers', matchColumn: 'name', label: 'manufacturer' },
        example: 'Apollo',
        note: 'Optional. Must match an existing manufacturer name (Gent, Advanced, Apollo, Hochiki).',
      },
      {
        header: 'supplier',
        field: 'supplier_id',
        kind: 'fk_name',
        fk: { table: 'suppliers', matchColumn: 'name', label: 'supplier' },
        note: 'Optional. Must match an existing supplier name.',
      },
      {
        header: 'service_type',
        field: 'service_type_id',
        kind: 'fk_name',
        fk: { table: 'service_types', matchColumn: 'name', label: 'service type' },
        note: 'Optional. Must match an existing service type name.',
      },
      {
        header: 'system_type',
        field: 'system_type_id',
        kind: 'fk_name',
        fk: { table: 'system_types', matchColumn: 'name', label: 'system type' },
        note: 'Optional. Must match an existing system type name.',
      },
      { header: 'quiescent_ma', field: 'quiescent_ma', kind: 'number', example: 0.35, note: 'Standby current draw in mA (for battery calc).' },
      { header: 'alarm_ma', field: 'alarm_ma', kind: 'number', example: 2.5, note: 'Alarm current draw in mA (for battery calc).' },
      { header: 'active', field: 'active', kind: 'boolean', example: true },
    ],
  },
  {
    key: 'quote_manufacturers',
    label: 'Quote — manufacturers',
    table: 'quote_manufacturers',
    description: 'Equipment manufacturers available in Quote Studio (Gent, Advanced, Apollo, Hochiki).',
    idField: 'id',
    naturalKey: 'code',
    revalidate: ['/dashboard/sales/quote-studio-preview'],
    columns: [
      { header: 'code', field: 'code', kind: 'text', required: true, example: 'APOLLO', note: 'Unique short code used to match rows.' },
      { header: 'name', field: 'name', kind: 'text', required: true, example: 'Apollo' },
      { header: 'position', field: 'position', kind: 'integer', example: 1 },
      { header: 'active', field: 'active', kind: 'boolean', example: true },
    ],
  },
  {
    key: 'quote_system_ranges',
    label: 'Quote — manufacturer ranges',
    table: 'quote_system_ranges',
    description: 'A manufacturer product range for a system type (e.g. Apollo Soteria for Fire Alarm).',
    idField: 'id',
    naturalKey: 'code',
    revalidate: ['/dashboard/sales/quote-studio-preview'],
    columns: [
      { header: 'code', field: 'code', kind: 'text', required: true, example: 'APOLLO_SOTERIA', note: 'Globally-unique range code used to match rows.' },
      { header: 'name', field: 'name', kind: 'text', required: true, example: 'Soteria Dimension' },
      {
        header: 'manufacturer',
        field: 'manufacturer_id',
        kind: 'fk_name',
        required: true,
        fk: { table: 'quote_manufacturers', matchColumn: 'name', label: 'manufacturer' },
        example: 'Apollo',
      },
      {
        header: 'system_type',
        field: 'system_type_id',
        kind: 'fk_name',
        fk: { table: 'system_types', matchColumn: 'name', label: 'system type' },
        example: 'Fire Alarm',
      },
      { header: 'is_default', field: 'is_default', kind: 'boolean', example: false, note: 'The default range for its manufacturer.' },
      { header: 'position', field: 'position', kind: 'integer', example: 1 },
      { header: 'active', field: 'active', kind: 'boolean', example: true },
    ],
  },
  {
    key: 'quote_range_parts',
    label: 'Quote — range parts',
    table: 'quote_range_parts',
    description:
      'The catalogue part used for each device type within a manufacturer range. Match the range by its code and the part by its product code.',
    idField: 'id',
    naturalKeyFields: ['range_id', 'device_key'],
    revalidate: ['/dashboard/sales/quote-studio-preview'],
    columns: [
      {
        header: 'range_code',
        field: 'range_id',
        kind: 'fk_name',
        required: true,
        fk: { table: 'quote_system_ranges', matchColumn: 'code', label: 'range' },
        example: 'APOLLO_SOTERIA',
      },
      { header: 'device_key', field: 'device_key', kind: 'text', required: true, example: 'smoke_detector', note: 'The Quote Studio device key.' },
      {
        header: 'part_code',
        field: 'catalogue_item_id',
        kind: 'fk_name',
        fk: { table: 'quote_catalogue_items', matchColumn: 'product_code', label: 'catalogue part' },
        example: 'OSD-100',
        note: 'Must match a catalogue item product code.',
      },
    ],
  },
  {
    key: 'parts',
    label: 'Parts',
    table: 'parts',
    description: 'The parts master catalogue used for stock and purchasing. Cost is in pounds (£).',
    idField: 'id',
    naturalKey: 'sku',
    revalidate: ['/dashboard/stock'],
    columns: [
      { header: 'sku', field: 'sku', kind: 'text', example: 'BAT-12V-7AH', note: 'Used to match rows when no id is present.' },
      { header: 'name', field: 'name', kind: 'text', required: true, example: '12V 7Ah Battery' },
      { header: 'description', field: 'description', kind: 'text' },
      { header: 'manufacturer', field: 'manufacturer', kind: 'text', example: 'Yuasa' },
      { header: 'unit', field: 'unit', kind: 'text', example: 'each' },
      { header: 'unit_cost_gbp', field: 'unit_cost', kind: 'number', example: 9.75, note: 'Cost price in £.' },
      { header: 'default_min_level', field: 'default_min_level', kind: 'integer', example: 5 },
      {
        header: 'supplier',
        field: 'supplier_id',
        kind: 'fk_name',
        fk: { table: 'suppliers', matchColumn: 'name', label: 'supplier' },
        note: 'Optional. Must match an existing supplier name.',
      },
      {
        header: 'nominal_code',
        field: 'nominal_code_id',
        kind: 'fk_name',
        fk: { table: 'nominal_codes', matchColumn: 'code', label: 'nominal code' },
        note: 'Optional. Must match an existing nominal code.',
      },
      { header: 'is_active', field: 'is_active', kind: 'boolean', example: true },
    ],
  },
  {
    key: 'stock_levels',
    label: 'Stock levels',
    table: 'stock_items',
    description:
      'Per-location stock quantities. Link to a location by name and a part by its SKU.',
    idField: 'id',
    naturalKeyFields: ['location_id', 'part_id'],
    revalidate: ['/dashboard/stock'],
    columns: [
      {
        header: 'location',
        field: 'location_id',
        kind: 'fk_name',
        required: true,
        fk: { table: 'stock_locations', matchColumn: 'name', label: 'location' },
        example: 'Main Warehouse',
        note: 'Must match an existing stock location name.',
      },
      {
        header: 'part_sku',
        field: 'part_id',
        kind: 'fk_name',
        required: true,
        fk: { table: 'parts', matchColumn: 'sku', label: 'part' },
        example: 'BAT-12V-7AH',
        note: 'Must match an existing part SKU.',
      },
      { header: 'quantity', field: 'quantity', kind: 'integer', required: true, example: 24 },
      { header: 'min_level', field: 'min_level', kind: 'integer', example: 5 },
      { header: 'target_level', field: 'target_level', kind: 'integer', example: 20 },
    ],
  },
]

export function getDataset(key: string): DatasetDef | undefined {
  return DATASETS.find((d) => d.key === key)
}
