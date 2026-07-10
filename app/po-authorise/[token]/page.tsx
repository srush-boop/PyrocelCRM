import { PoAuthoriseClient } from './po-authorise-client'

interface PageProps {
  params: Promise<{ token: string }>
}

export default async function PoAuthorisePage({ params }: PageProps) {
  const { token } = await params
  const companyName = process.env.COMPANY_NAME || 'Pyrocel'

  return <PoAuthoriseClient token={token} companyName={companyName} />
}
