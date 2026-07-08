import type { DocumentOwnerType } from '@/lib/types/database'

// A single mergeable field the user can insert into a template body / preview.
export interface MergeToken {
  // The token key without braces, e.g. "client.contact_name".
  token: string
  // Human label shown in the "Insert field" menu.
  label: string
}

export interface MergeTokenGroup {
  heading: string
  tokens: MergeToken[]
}

// Fields that are always available regardless of the chosen entity.
const ALWAYS_ON: MergeTokenGroup = {
  heading: 'Company & general',
  tokens: [
    { token: 'company.name', label: 'Company name' },
    { token: 'company.address', label: 'Company address' },
    { token: 'company.phone', label: 'Company phone' },
    { token: 'company.email', label: 'Company email' },
    { token: 'company.website', label: 'Company website' },
    { token: 'company.registration_number', label: 'Company reg. number' },
    { token: 'company.vat_number', label: 'Company VAT number' },
    { token: 'today', label: "Today's date" },
    { token: 'user.name', label: 'Your name (sender)' },
    { token: 'user.email', label: 'Your email (sender)' },
  ],
}

const CLIENT_GROUP: MergeTokenGroup = {
  heading: 'Client',
  tokens: [
    { token: 'client.name', label: 'Client name' },
    { token: 'client.contact_name', label: 'Client contact name' },
    { token: 'client.contact_email', label: 'Client contact email' },
    { token: 'client.contact_phone', label: 'Client contact phone' },
    { token: 'client.address', label: 'Client address' },
  ],
}

const SITE_GROUP: MergeTokenGroup = {
  heading: 'Site',
  tokens: [
    { token: 'site.name', label: 'Site name' },
    { token: 'site.address', label: 'Site address' },
    { token: 'site.postcode', label: 'Site postcode' },
    { token: 'site.contact_name', label: 'Site contact name' },
    { token: 'site.contact_email', label: 'Site contact email' },
    { token: 'site.contact_phone', label: 'Site contact phone' },
  ],
}

const SYSTEM_GROUP: MergeTokenGroup = {
  heading: 'System',
  tokens: [
    { token: 'system.name', label: 'System / service name' },
    { token: 'system.frequency', label: 'Service frequency' },
    { token: 'system.next_service_date', label: 'Next service date' },
  ],
}

const CALL_GROUP: MergeTokenGroup = {
  heading: 'Call',
  tokens: [
    { token: 'call.reference', label: 'Call reference' },
    { token: 'call.date', label: 'Call scheduled date' },
    { token: 'call.status', label: 'Call status' },
    { token: 'call.type', label: 'Call type' },
  ],
}

const QUOTE_GROUP: MergeTokenGroup = {
  heading: 'Quote',
  tokens: [
    { token: 'quote.number', label: 'Quote number' },
    { token: 'quote.title', label: 'Quote title' },
    { token: 'quote.total', label: 'Quote total' },
    { token: 'quote.valid_until', label: 'Quote valid until' },
  ],
}

const JOB_GROUP: MergeTokenGroup = {
  heading: 'Job',
  tokens: [
    { token: 'job.number', label: 'Job number' },
    { token: 'job.title', label: 'Job title' },
    { token: 'job.po_number', label: 'Job PO number' },
    { token: 'job.total', label: 'Job total' },
  ],
}

// Which extra groups (beyond client/site + always-on) are relevant per entity.
// Most entities resolve up to their client + site, so those are broadly offered.
const ENTITY_GROUPS: Record<DocumentOwnerType, MergeTokenGroup[]> = {
  client: [CLIENT_GROUP],
  site: [CLIENT_GROUP, SITE_GROUP],
  site_service: [CLIENT_GROUP, SITE_GROUP, SYSTEM_GROUP],
  system_reference: [],
  site_engineer: [CLIENT_GROUP, SITE_GROUP],
  task: [CLIENT_GROUP, SITE_GROUP, SYSTEM_GROUP, CALL_GROUP],
  quote: [CLIENT_GROUP, SITE_GROUP, QUOTE_GROUP],
  job: [CLIENT_GROUP, SITE_GROUP, JOB_GROUP],
}

// The grouped tokens offered by the editor's "Insert field" menu for an entity.
export function getMergeTokenGroups(ownerType: DocumentOwnerType): MergeTokenGroup[] {
  const groups = ENTITY_GROUPS[ownerType] ?? []
  return [...groups, ALWAYS_ON]
}

// Friendly label for an owner type (used in dialog titles etc.).
export const OWNER_TYPE_LABELS: Record<DocumentOwnerType, string> = {
  client: 'Client',
  site: 'Site',
  site_service: 'System',
  system_reference: 'System reference',
  site_engineer: 'Site engineer',
  task: 'Call',
  quote: 'Quote',
  job: 'Job',
}
