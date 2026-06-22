'use client'

import type { ReactNode } from 'react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'

export type SiteAsset = {
  value: string
  label: string
  content: ReactNode
}

interface SiteAssetsTabProps {
  assets: SiteAsset[]
}

export function SiteAssetsTab({ assets }: SiteAssetsTabProps) {
  if (assets.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No asset registers apply to this site. Asset types are determined by the services assigned to
        the site.
      </p>
    )
  }

  return (
    <Tabs defaultValue={assets[0].value} className="gap-4">
      <TabsList className="h-auto flex-wrap justify-start">
        {assets.map((asset) => (
          <TabsTrigger key={asset.value} value={asset.value} className="flex-none">
            {asset.label}
          </TabsTrigger>
        ))}
      </TabsList>

      {assets.map((asset) => (
        <TabsContent key={asset.value} value={asset.value} className="mt-0">
          {asset.content}
        </TabsContent>
      ))}
    </Tabs>
  )
}
