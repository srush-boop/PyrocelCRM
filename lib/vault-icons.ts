import {
  Link as LinkIcon,
  FileText,
  FolderOpen,
  ClipboardList,
  Calendar,
  Clock,
  FileSpreadsheet,
  BookOpen,
  GraduationCap,
  HeartPulse,
  ShieldCheck,
  Wrench,
  Truck,
  Users,
  Building2,
  Mail,
  Phone,
  CreditCard,
  Receipt,
  Banknote,
  Plane,
  Camera,
  Cloud,
  Database,
  ExternalLink,
  type LucideIcon,
} from 'lucide-react'

// Curated set of icons an admin can pick for an Employee Vault button. Keyed by
// a stable string stored in the DB (`vault_buttons.icon`).
export const VAULT_ICONS: Record<string, LucideIcon> = {
  link: LinkIcon,
  external: ExternalLink,
  file: FileText,
  spreadsheet: FileSpreadsheet,
  folder: FolderOpen,
  form: ClipboardList,
  calendar: Calendar,
  clock: Clock,
  book: BookOpen,
  training: GraduationCap,
  health: HeartPulse,
  safety: ShieldCheck,
  tools: Wrench,
  vehicle: Truck,
  people: Users,
  building: Building2,
  mail: Mail,
  phone: Phone,
  card: CreditCard,
  receipt: Receipt,
  expenses: Banknote,
  holiday: Plane,
  photo: Camera,
  cloud: Cloud,
  database: Database,
}

// Ordered keys for rendering an icon picker.
export const VAULT_ICON_KEYS = Object.keys(VAULT_ICONS)

// Resolves a stored icon key to a component, falling back to a generic link.
export function getVaultIcon(key: string | null | undefined): LucideIcon {
  if (key && VAULT_ICONS[key]) return VAULT_ICONS[key]
  return LinkIcon
}
