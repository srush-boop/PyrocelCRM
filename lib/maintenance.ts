/**
 * Modernised maintenance service-agreement copy.
 *
 * The defaults below are a professional rewrite of the customer's legacy
 * "Maintenance Service — Sales Department Specification" document (cover letter,
 * cover summary, FAQs and accreditations). They are typed so office staff can
 * override any part from Settings without code changes; the quote document falls
 * back to these defaults when no override is stored.
 */

export interface MaintenanceCoverSection {
  title: string
  body: string
}

export interface MaintenanceFaq {
  question: string
  answer: string
}

export interface MaintenanceAgreementCopy {
  /** Short strapline shown under the "Service Agreement" heading. */
  strapline: string
  /** Opening paragraphs of the cover letter (site name is interpolated). */
  introParagraphs: string[]
  /** Overview-of-service sections (Reactive Services, Comprehensive Cover, etc.). */
  coverSections: MaintenanceCoverSection[]
  /** Closing paragraphs before the signature. */
  closingParagraphs: string[]
  /** Frequently asked questions. */
  faqs: MaintenanceFaq[]
  /** Systems Pyrocel design, supply, install and commission. */
  servicesOffered: string[]
  /** Accreditation names displayed in the footer band. */
  accreditations: string[]
}

export const DEFAULT_MAINTENANCE_AGREEMENT: MaintenanceAgreementCopy = {
  strapline:
    'Planned maintenance and reactive cover for your life-safety and security systems.',
  introParagraphs: [
    'Thank you for the opportunity to provide this service quotation. Enclosed you will find our proposed pricing together with a summary of our service agreement for the maintenance of the safety and security systems installed at your site, in line with the relevant British and industry Standards.',
    'The overview below explains how we deliver our service so you have a clear understanding of what is included and the commitments we make to you.',
  ],
  coverSections: [
    {
      title: 'Reactive Services',
      body: 'For contract customers we provide a 24-hour emergency call-out service with a genuine 4-hour response time on selected systems. This covers fire alarm, emergency lighting, CCTV, access control, AFILS, intruder and electrical life-safety and security systems.',
    },
    {
      title: 'Comprehensive Cover',
      body: 'Our comprehensive agreements for fire alarm systems include call-out and remedial work as standard. Provided equipment has failed through normal use and without external interference, parts and labour are included under a comprehensive agreement. Full details are set out in our terms and conditions (part 16).',
    },
    {
      title: 'Payment',
      body: 'Charges for replacement parts and emergency call-outs are due 30 days net from completion of the work. The annual service-contract sum is payable in advance unless otherwise agreed. Billing is flexible — please contact us if you would prefer an alternative payment plan and we will be happy to discuss terms.',
    },
    {
      title: 'Engineering Overview',
      body: 'Every engineer carries a monitored stock of spares so that most faults can be resolved during the first visit. This reduces system downtime, minimises return visits and helps keep your ongoing costs down.',
    },
    {
      title: 'DBS Checks — For Your Assurance',
      body: 'Pyrocel uses an NSI-approved body to carry out standard DBS checks on all site-based personnel. All staff have been cleared of any information that would give cause for concern about their suitability for their role within the company.',
    },
    {
      title: 'Working Hours',
      body: 'Pricing is based on planned maintenance carried out during normal working hours, 08:30–17:00 Monday to Friday, excluding statutory and public holidays. An emergency response service is included at the rates shown. Out-of-hours attendance, staged works, or return visits caused by a failure to gain access are chargeable at our standard schedule of rates unless otherwise stated in this proposal.',
    },
  ],
  closingParagraphs: [
    'We hope this proposal meets your requirements. To proceed, please select your preferred plan, sign the enclosed agreement and return a copy to Pyrocel.',
    'I look forward to hearing from you. If I can be of any assistance in the meantime, please do not hesitate to contact me at the office.',
  ],
  faqs: [
    {
      question: 'Do I need fire alarm maintenance?',
      answer:
        'Yes — it is a legal requirement. The Regulatory Reform (Fire Safety) Order 2005 requires that any safety equipment provided under the Order is subject to a suitable system of maintenance, and BS 5839-1 recommends your fire alarm is maintained by a reputable service organisation. Many insurance policies also require maintenance in line with British Standard recommendations. Your fire alarm is a life-safety system that should be fully functional at all times; routine maintenance and testing demonstrates your duty of care and commitment to the safety of your employees.',
    },
    {
      question: 'How many maintenance visits per year do I need?',
      answer:
        'This depends on a risk assessment of your site, taking into account factors such as occupancy and fire risk. The minimum recommended number of visits is two per year.',
    },
    {
      question: 'If my system is under warranty, do I still need a maintenance contract?',
      answer:
        'Yes. Just as a car under warranty must be serviced regularly for the warranty to remain valid, the same applies to fire alarms. The British Standard does not exclude new or warranty systems from maintenance.',
    },
    {
      question: 'Do I need emergency lighting maintenance?',
      answer: 'Yes — this is also a British Standard recommendation.',
    },
    {
      question: 'Do I need induction loops installed?',
      answer:
        'If you provide a service to the public, then yes. Under the Building Regulations 2010, any entrance hall or reception area should be provided with a hearing enhancement system such as an induction loop.',
    },
    {
      question: 'Do I need to maintain my induction loops?',
      answer:
        'Yes. It is a legal requirement to ensure that any auxiliary aid provided for the hard of hearing is maintained, as enforced by the Equality Act 2010.',
    },
    {
      question: 'How often should my emergency lights be tested?',
      answer:
        'Emergency lights should be tested monthly by simulating a power failure, with a further annual test to confirm they will perform correctly in an emergency.',
    },
    {
      question: 'What other benefits will I receive?',
      answer:
        'By choosing Pyrocel you gain access to our 24-hour emergency call cover with a genuine 4-hour response time. Our engineers use mobile software that lets our office produce your site report as soon as the visit is complete, so you receive the works report — highlighting any defects found — by email immediately, or by post where email is not available.',
    },
  ],
  servicesOffered: [
    'Fire Detection & Alarm Systems',
    'Closed Circuit Television (CCTV) Systems',
    'Access Control Systems',
    'Emergency Lighting Systems',
    'Aspirating Systems',
    'Nurse / Warden Call Systems',
    'Remote System Monitoring',
    'AFILS (Induction Loop Systems)',
  ],
  accreditations: ['NSI Gold', 'BAFE', 'SafeContractor', 'ISO 9001', 'CHAS'],
}

/** Merge stored overrides (from company settings) over the modernised defaults. */
export function resolveMaintenanceAgreement(
  overrides?: Partial<MaintenanceAgreementCopy> | null,
): MaintenanceAgreementCopy {
  if (!overrides) return DEFAULT_MAINTENANCE_AGREEMENT
  return {
    ...DEFAULT_MAINTENANCE_AGREEMENT,
    ...overrides,
    // Preserve defaults when an override array is empty/missing.
    introParagraphs: overrides.introParagraphs?.length
      ? overrides.introParagraphs
      : DEFAULT_MAINTENANCE_AGREEMENT.introParagraphs,
    coverSections: overrides.coverSections?.length
      ? overrides.coverSections
      : DEFAULT_MAINTENANCE_AGREEMENT.coverSections,
    closingParagraphs: overrides.closingParagraphs?.length
      ? overrides.closingParagraphs
      : DEFAULT_MAINTENANCE_AGREEMENT.closingParagraphs,
    faqs: overrides.faqs?.length ? overrides.faqs : DEFAULT_MAINTENANCE_AGREEMENT.faqs,
    servicesOffered: overrides.servicesOffered?.length
      ? overrides.servicesOffered
      : DEFAULT_MAINTENANCE_AGREEMENT.servicesOffered,
    accreditations: overrides.accreditations?.length
      ? overrides.accreditations
      : DEFAULT_MAINTENANCE_AGREEMENT.accreditations,
  }
}
