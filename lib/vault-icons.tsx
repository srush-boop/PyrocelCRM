import {
  Link as LinkIcon,
  FileText,
  FolderOpen,
  ClipboardList,
  Calendar,
  Mail,
  Phone,
  BookOpen,
  GraduationCap,
  ShieldCheck,
  Wrench,
  Users,
  CreditCard,
  Clock,
  MapPin,
  Briefcase,
  HelpCircle,
  type LucideIcon,
} from 'lucide-react'

// The icon options offered when configuring a vault button. The key is stored
// in vault_buttons.icon; LinkIcon is the default fallback.
export const VAULT_ICONS: Record<string, LucideIcon> = {
  link: LinkIcon,
  form: ClipboardList,
  file: FileText,
  folder: FolderOpen,
  calendar: Calendar,
  mail: Mail,
  phone: Phone,
  book: BookOpen,
  training: GraduationCap,
  compliance: ShieldCheck,
  tools: Wrench,
  hr: Users,
  payroll: CreditCard,
  timesheet: Clock,
  location: MapPin,
  work: Briefcase,
  help: HelpCircle,
}

export const VAULT_ICON_KEYS = Object.keys(VAULT_ICONS)

export function getVaultIcon(icon: string | null | undefined): LucideIcon {
  if (icon && VAULT_ICONS[icon]) return VAULT_ICONS[icon]
  return LinkIcon
}
