import type { MaintenanceAgreementCopy } from '@/lib/maintenance'
import type { Branch } from '@/lib/types/database'

interface MaintenanceAgreementDocumentProps {
  copy: MaintenanceAgreementCopy
  companyName: string
  siteName?: string | null
  recipientName?: string | null
  preparerName?: string | null
  branch?: Branch | null
}

// A small uppercase eyebrow label reused across the agreement pages.
function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
      {children}
    </p>
  )
}

/**
 * Modernised maintenance service-agreement pages appended to a maintenance
 * quote (cover letter, comprehensive-cover summary, FAQ and accreditations).
 * All copy comes from `MaintenanceAgreementCopy` so office staff can override it
 * from Settings; this component only handles presentation.
 */
export function MaintenanceAgreementDocument({
  copy,
  companyName,
  siteName,
  recipientName,
  preparerName,
  branch,
}: MaintenanceAgreementDocumentProps) {
  const intro = copy.introParagraphs.map((p) =>
    siteName ? p.replace(/your site/gi, siteName) : p,
  )

  return (
    <div className="mt-12 break-before-page">
      {/* Cover letter */}
      <section className="break-inside-avoid">
        <Eyebrow>Service Agreement</Eyebrow>
        <h2 className="mt-1 text-2xl font-bold leading-tight text-balance">
          Maintenance Service Agreement
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">{copy.strapline}</p>

        <div className="mt-6 space-y-3 text-sm leading-relaxed">
          {recipientName && <p className="font-medium">Dear {recipientName},</p>}
          {intro.map((p, i) => (
            <p key={i} className="text-muted-foreground">
              {p}
            </p>
          ))}
        </div>
      </section>

      {/* Overview of service */}
      <section className="mt-8 break-inside-avoid">
        <h3 className="mb-3 border-b pb-1 text-sm font-semibold uppercase tracking-wide">
          Overview of service
        </h3>
        <div className="grid gap-4 sm:grid-cols-2">
          {copy.coverSections.map((s) => (
            <div key={s.title} className="rounded-md border bg-muted/30 p-4">
              <p className="font-semibold">{s.title}</p>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Closing */}
      {copy.closingParagraphs.length > 0 && (
        <section className="mt-8 space-y-3 break-inside-avoid text-sm leading-relaxed">
          {copy.closingParagraphs.map((p, i) => (
            <p key={i} className="text-muted-foreground">
              {p}
            </p>
          ))}
          <div className="pt-2">
            <p className="font-medium">Yours faithfully,</p>
            <p>{preparerName || companyName}</p>
            {branch?.name && <p className="text-muted-foreground">{branch.name}</p>}
            {branch?.phone && <p className="text-muted-foreground">{branch.phone}</p>}
          </div>
        </section>
      )}

      {/* FAQ */}
      {copy.faqs.length > 0 && (
        <section className="mt-10 break-inside-avoid break-before-page">
          <Eyebrow>Frequently asked questions</Eyebrow>
          <h3 className="mt-1 mb-4 text-xl font-bold">Your questions answered</h3>
          <div className="space-y-4">
            {copy.faqs.map((f) => (
              <div key={f.question} className="break-inside-avoid">
                <p className="text-sm font-semibold">{f.question}</p>
                <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">{f.answer}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Services offered */}
      {copy.servicesOffered.length > 0 && (
        <section className="mt-10 break-inside-avoid">
          <h3 className="mb-3 border-b pb-1 text-sm font-semibold uppercase tracking-wide">
            Systems we design, supply, install &amp; maintain
          </h3>
          <ul className="grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
            {copy.servicesOffered.map((s) => (
              <li key={s} className="flex items-start gap-2">
                <span aria-hidden className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                <span>{s}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Accreditations */}
      {copy.accreditations.length > 0 && (
        <section className="mt-8 break-inside-avoid rounded-md border bg-muted/30 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Accreditations
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {copy.accreditations.map((a) => (
              <span
                key={a}
                className="rounded-full border bg-card px-3 py-1 text-xs font-medium"
              >
                {a}
              </span>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
