'use client'

import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import {
  riskScore,
  riskBand,
  riskCellColor,
  RISK_BAND_CLASS,
  RISK_BAND_LABEL,
  LIKELIHOOD_LABELS,
  SEVERITY_LABELS,
} from '@/lib/rams/risk'

export function RiskScoreBadge({
  likelihood,
  severity,
}: {
  likelihood: number
  severity: number
}) {
  const score = riskScore(likelihood, severity)
  const band = riskBand(score)
  return (
    <Badge variant="outline" className={cn('font-mono', RISK_BAND_CLASS[band])}>
      {score} · {RISK_BAND_LABEL[band]}
    </Badge>
  )
}

// A 5x5 reference matrix (severity across, likelihood down).
export function RiskMatrixReference() {
  const values = [1, 2, 3, 4, 5]
  return (
    <div className="inline-block overflow-hidden rounded-md border text-xs">
      <div className="flex">
        <div className="flex w-24 items-end justify-center bg-muted p-2 font-medium">
          L \ S
        </div>
        {values.map((s) => (
          <div
            key={s}
            className="w-20 bg-muted p-2 text-center font-medium"
            title={SEVERITY_LABELS[s]}
          >
            {s}
          </div>
        ))}
      </div>
      {values
        .slice()
        .reverse()
        .map((l) => (
          <div key={l} className="flex">
            <div
              className="flex w-24 items-center justify-center bg-muted p-2 font-medium"
              title={LIKELIHOOD_LABELS[l]}
            >
              {l}
            </div>
            {values.map((s) => {
              const score = l * s
              return (
                <div
                  key={s}
                  className="w-20 p-2 text-center font-medium text-white"
                  style={{ backgroundColor: riskCellColor(score) }}
                >
                  {score}
                </div>
              )
            })}
          </div>
        ))}
    </div>
  )
}
