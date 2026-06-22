'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import {
  ArrowLeft,
  Building2,
  MapPin,
  QrCode,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  MinusCircle,
  Calendar,
  User,
} from 'lucide-react'
import { ExtinguisherLabel } from './extinguisher-label'
import { CHECK_ITEMS } from './extinguisher-inspection-card'
import {
  EXTINGUISHER_TYPE_LABELS,
  RESULT_LABELS,
  SERVICE_LEVEL_LABELS,
} from '@/lib/extinguishers'
import { formatDateUK } from '@/lib/utils'
import type {
  Extinguisher,
  ExtinguisherInspection,
  Profile,
  Site,
  ExtinguisherResult,
} from '@/lib/types/database'

interface ExtinguisherAssetProps {
  extinguisher: Extinguisher & { site: Site | null }
  inspections: (ExtinguisherInspection & { inspector: Profile | null })[]
  role: Profile['role']
}

const RESULT_VARIANT: Record<ExtinguisherResult, 'default' | 'destructive' | 'secondary' | 'outline'> = {
  pass: 'default',
  fail: 'destructive',
  remedial: 'secondary',
  na: 'outline',
}

function ResultIcon({ result }: { result: ExtinguisherResult }) {
  if (result === 'pass') return <CheckCircle2 className="h-5 w-5 text-green-600" />
  if (result === 'fail') return <XCircle className="h-5 w-5 text-destructive" />
  if (result === 'remedial') return <AlertTriangle className="h-5 w-5 text-amber-600" />
  return <MinusCircle className="h-5 w-5 text-muted-foreground" />
}

export function ExtinguisherAsset({ extinguisher, inspections, role }: ExtinguisherAssetProps) {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-start gap-4">
        <Button variant="ghost" size="icon" asChild className="mt-1">
          <Link href="/dashboard/extinguishers">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <Badge variant="outline">{EXTINGUISHER_TYPE_LABELS[extinguisher.extinguisher_type]}</Badge>
            {extinguisher.latest_result && (
              <Badge variant={RESULT_VARIANT[extinguisher.latest_result]} className="capitalize">
                {RESULT_LABELS[extinguisher.latest_result]}
              </Badge>
            )}
          </div>
          <h1 className="font-mono text-2xl font-bold">{extinguisher.urn}</h1>
          {extinguisher.reference && (
            <p className="text-sm text-muted-foreground">Ref: {extinguisher.reference}</p>
          )}
        </div>
        {role !== 'engineer' && (
          <Button variant="outline" size="sm" asChild>
            <Link href={`/dashboard/extinguishers/labels?ids=${extinguisher.id}`} target="_blank">
              <QrCode className="mr-2 h-4 w-4" />
              Print QR
            </Link>
          </Button>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Building2 className="h-5 w-5" />
              Asset Details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {extinguisher.site && (
              <div className="flex items-start gap-2">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <Link href={`/dashboard/sites/${extinguisher.site.id}`} className="text-primary hover:underline">
                  {extinguisher.site.name}
                </Link>
              </div>
            )}
            <div className="grid grid-cols-2 gap-2 pt-1">
              <Detail label="Floor / Level" value={extinguisher.floor} />
              <Detail label="Capacity" value={extinguisher.capacity} />
              <Detail label="Serial No." value={extinguisher.serial_number} />
              <Detail
                label="Manufactured"
                value={extinguisher.manufacture_date ? formatDateUK(extinguisher.manufacture_date) : null}
              />
              <Detail
                label="Commissioned"
                value={extinguisher.commissioned_date ? formatDateUK(extinguisher.commissioned_date) : null}
              />
              <Detail label="Location" value={extinguisher.location} className="col-span-2" />
            </div>
            {extinguisher.notes && (
              <>
                <Separator className="my-2" />
                <p className="text-muted-foreground">{extinguisher.notes}</p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">QR Label</CardTitle>
            <CardDescription>Scan to open this history</CardDescription>
          </CardHeader>
          <CardContent>
            <ExtinguisherLabel extinguisher={extinguisher} siteName={extinguisher.site?.name} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Service History</CardTitle>
          <CardDescription>
            {inspections.length} service{inspections.length === 1 ? '' : 's'} recorded
          </CardDescription>
        </CardHeader>
        <CardContent>
          {inspections.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No services recorded yet for this extinguisher.
            </p>
          ) : (
            <ol className="relative space-y-6 border-l pl-6">
              {inspections.map((insp) => (
                <li key={insp.id} className="avoid-break">
                  <span className="absolute -left-[9px] flex h-4 w-4 items-center justify-center">
                    <span className="h-3 w-3 rounded-full border-2 border-background bg-primary" />
                  </span>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <ResultIcon result={insp.overall_result} />
                      <span className="font-medium">{RESULT_LABELS[insp.overall_result]}</span>
                      {insp.service_level && (
                        <Badge variant="outline" className="text-xs">
                          {SERVICE_LEVEL_LABELS[insp.service_level]}
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {formatDateUK(insp.inspection_date)}
                      </span>
                      {insp.inspector?.full_name && (
                        <span className="flex items-center gap-1">
                          <User className="h-3 w-3" />
                          {insp.inspector.full_name}
                        </span>
                      )}
                    </div>
                  </div>

                  {!insp.accessible ? (
                    <p className="mt-2 text-sm text-muted-foreground">
                      Not accessible{insp.access_notes ? `: ${insp.access_notes}` : ''}
                    </p>
                  ) : (
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
                      {CHECK_ITEMS.map((item) => {
                        const val = insp[item.key as keyof ExtinguisherInspection] as boolean | null
                        if (val === null || val === undefined) return null
                        return (
                          <span key={item.key} className="flex items-center gap-1">
                            {val ? (
                              <CheckCircle2 className="h-3 w-3 text-green-600" />
                            ) : (
                              <XCircle className="h-3 w-3 text-destructive" />
                            )}
                            {item.label}
                          </span>
                        )
                      })}
                    </div>
                  )}

                  {insp.condition && (
                    <p className="mt-1 text-xs text-muted-foreground capitalize">
                      Condition: {insp.condition}
                    </p>
                  )}
                  {insp.remedial_action && (
                    <p className="mt-1 rounded bg-amber-500/10 px-2 py-1 text-xs text-amber-700 dark:text-amber-400">
                      Remedial: {insp.remedial_action}
                    </p>
                  )}
                  {insp.comments && (
                    <p className="mt-1 text-xs text-muted-foreground">{insp.comments}</p>
                  )}

                  {insp.photos && insp.photos.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {insp.photos.map((url) => (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          key={url}
                          src={url || '/placeholder.svg'}
                          alt="Service"
                          className="h-16 w-16 rounded-md border object-cover"
                        />
                      ))}
                    </div>
                  )}
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function Detail({
  label,
  value,
  className,
}: {
  label: string
  value: string | null
  className?: string
}) {
  return (
    <div className={className}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm">{value || '-'}</p>
    </div>
  )
}
