import { resolveCallKind } from '@/lib/call-kinds'
import type { ClientSignatureMode, ServiceType } from '@/lib/types/database'

export const CLIENT_SIGNATURE_OPTIONS: {
  value: ClientSignatureMode | 'default'
  label: string
  description: string
}[] = [
  {
    value: 'default',
    label: 'Default (by call type)',
    description: 'Required on reactive and planned calls, not collected on recurring visits.',
  },
  {
    value: 'required',
    label: 'Required',
    description: 'Engineers must capture a signature or give a reason why not before completing.',
  },
  {
    value: 'optional',
    label: 'Optional',
    description: 'Engineers can capture a signature but can complete without one.',
  },
  {
    value: 'none',
    label: 'Not collected',
    description: 'No client sign-off is shown on these calls.',
  },
]

export function resolveClientSignature(
  serviceType: Pick<ServiceType, 'call_kind' | 'is_recurring' | 'client_signature_mode'> | null | undefined,
): { show: boolean; required: boolean } {
  if (!serviceType) return { show: true, required: true }
  const mode =
    serviceType.client_signature_mode ??
    (resolveCallKind(serviceType) === 'recurring' ? 'none' : 'required')
  return { show: mode !== 'none', required: mode === 'required' }
}
