import { notFound } from 'next/navigation'
import { getReceiptByToken } from '@/lib/rams/approval-actions'
import { getRamsSettings } from '@/lib/rams/actions'
import { ReceiptResponse } from '@/components/rams/receipt-response'
import { RiskScoreBadge } from '@/components/rams/risk-matrix'
import { formatDateUK } from '@/lib/utils'
import type { SelectedHazard, MethodStep } from '@/lib/rams/types'

export const dynamic = 'force-dynamic'

export default async function ReceiptPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const [ctx, settings] = await Promise.all([
    getReceiptByToken(token),
    getRamsSettings(),
  ])
  if (!ctx) notFound()

  const { approval, document: doc, client, preparedBy } = ctx
  const hazards = (doc.selected_hazards as SelectedHazard[]) ?? []
  const methodSteps = (doc.method_steps as MethodStep[]) ?? []
  const ppe = (doc.ppe_requirements as string[]) ?? []

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-6 px-4 py-8">
      <header className="flex flex-col gap-1 border-b pb-4">
        <p className="text-sm font-medium text-muted-foreground">
          {settings?.company_name ?? 'RAMS'} — Document Receipt
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-balance">
          {doc.title}
        </h1>
        <p className="font-mono text-sm text-muted-foreground">
          {doc.rams_number} · Rev {doc.revision}
        </p>
      </header>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Client" value={client?.name ?? '—'} />
        <Field label="Prepared by" value={preparedBy?.full_name ?? '—'} />
        <Field label="Work location" value={doc.work_location ?? '—'} />
        <Field
          label="Planned start"
          value={doc.planned_start_date ? formatDateUK(doc.planned_start_date) : '—'}
        />
      </section>

      {doc.work_description ? (
        <Block title="Description of works">
          <p className="text-sm leading-relaxed whitespace-pre-line">
            {doc.work_description}
          </p>
        </Block>
      ) : null}

      {hazards.length > 0 ? (
        <Block title={`Hazards & risk (${hazards.length})`}>
          <ul className="flex flex-col gap-3">
            {hazards.map((h, i) => (
              <li key={i} className="flex flex-col gap-1 rounded-md border p-3">
                <div className="flex items-start justify-between gap-3">
                  <span className="text-sm font-medium">{h.description}</span>
                  <RiskScoreBadge
                    likelihood={h.residual_likelihood}
                    severity={h.residual_severity}
                  />
                </div>
                {h.controls?.length ? (
                  <ul className="ml-4 list-disc text-sm text-muted-foreground">
                    {h.controls.map((c, ci) => (
                      <li key={ci}>{c}</li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
          </ul>
        </Block>
      ) : null}

      {ppe.length > 0 ? (
        <Block title="PPE required">
          <div className="flex flex-wrap gap-2">
            {ppe.map((p) => (
              <span
                key={p}
                className="rounded-full border bg-muted px-3 py-1 text-xs"
              >
                {p}
              </span>
            ))}
          </div>
        </Block>
      ) : null}

      {methodSteps.length > 0 ? (
        <Block title="Method statement">
          <ol className="flex flex-col gap-2">
            {methodSteps.map((s, i) => (
              <li key={i} className="flex gap-3 text-sm">
                <span className="font-mono text-muted-foreground">{i + 1}.</span>
                <span className="leading-relaxed">{s.description}</span>
              </li>
            ))}
          </ol>
        </Block>
      ) : null}

      <ReceiptResponse
        token={token}
        alreadyAcknowledged={approval.status !== 'pending'}
        recipientName={approval.recipient_name}
      />
    </main>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <span className="text-sm">{value}</span>
    </div>
  )
}

function Block({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="flex flex-col gap-3 rounded-lg border bg-card p-4">
      <h2 className="text-sm font-semibold">{title}</h2>
      {children}
    </section>
  )
}
