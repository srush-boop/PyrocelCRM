import { PoAuthoriseClient } from './po-authorise-client'
import { getPoAuthorisationStatus } from '@/lib/actions/po-requests'

interface PageProps {
  params: Promise<{ token: string }>
}

export default async function PoAuthorisePage({ params }: PageProps) {
  const { token } = await params
  const companyName = process.env.COMPANY_NAME || 'Pyrocel'

  const status = await getPoAuthorisationStatus(token)

  return <PoAuthoriseClient token={token} companyName={companyName} status={status} />
}
