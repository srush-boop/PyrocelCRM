import type { ReactNode } from 'react'
import { SalesNav } from '@/components/dashboard/sales/sales-nav'

export default function SalesLayout({ children }: { children: ReactNode }) {
  return (
    <div className="space-y-6">
      <SalesNav />
      {children}
    </div>
  )
}
