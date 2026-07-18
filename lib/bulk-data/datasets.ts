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
      { header: 'contact_name', field: 'contact_name', kind: 'text' },
      { header: 'contact_email', field: 'contact_email', kind: 'text' },
      { header: 'contact_phone', field: 'contact_phone', kind: 'text' },
      { header: 'status', field: 'status', kind: 'text', example: 'active', note: "e.g. 'active' or 'inactive'." },
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
      { header: 'status', field: 'status', kind: 'text', example: 'active' },
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
      { header: 'margin_percent', field: 'margin_percent', kind: 'number', example: 42 },
      {
        header: 'manufacturer',
        field: 'manufacturer_id',
        kind: 'fk_name',
        fk: { table: 'quote_manufacturers', matchColumn: 'name', label: 'manufacturer' },
        example: 'Apollo',
        note: 'Optional. Must match an existing manufacturer name (Gent, Advanced, Apollo, Hochiki).',
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
      { header: 'unit', field: 'unit', kind: 'text', example: 'each' },
      { header: 'unit_cost_gbp', field: 'unit_cost', kind: 'number', example: 9.75, note: 'Cost price in £.' },
      { header: 'default_min_level', field: 'default_min_level', kind: 'integer', example: 5 },
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
