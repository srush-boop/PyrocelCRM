// Knowledge base for AI-assisted fire alarm (fire detection & alarm system)
// specifications, derived from Pyrocel's BAFE SP203 specification template.
//
// This is used as grounding context for two AI steps in the quote builder:
//   1. Generating the relevant questions (with suggested answers) after a user
//      selects a fire alarm system type + type of work.
//   2. Compiling the answered questions into a professional specification.
//
// It is intentionally scoped to fire alarm systems only. Other disciplines
// (emergency lighting, extinguishers, etc.) fall back to generic AI drafting
// until their own specification templates are captured.

// A single decision point in the BAFE SP203 spec. Each records the question a
// designer/estimator must answer, the standard response options, the sensible
// default, and the exact wording the standard responses map to in the finished
// specification. The AI uses these to phrase questions, pre-select suggestions,
// and compile faithful specification text.
export interface FireAlarmSpecTopic {
  id: string
  question: string
  help?: string
  type: 'single' | 'multi' | 'text'
  options: string[]
  // The recommended default answer(s). For 'single'/'text' use one entry.
  suggested: string[]
  // How each option should read in the compiled specification. Keyed by option
  // label; the model uses these verbatim (adapting only names/quantities).
  responses?: Record<string, string>
}

export const FIRE_ALARM_SPEC_TOPICS: FireAlarmSpecTopic[] = [
  {
    id: 'modules',
    question: 'Which fire alarm modules are being quoted?',
    help: 'This determines how the works will be certificated (BAFE Modular).',
    type: 'multi',
    options: ['Design', 'Installation', 'Commissioning & Handover', 'Equipment Supply'],
    suggested: ['Design', 'Installation', 'Commissioning & Handover', 'Equipment Supply'],
    responses: {
      Design: 'Design',
      Installation: 'Installation',
      'Commissioning & Handover': 'Commissioning & Handover (including Equipment Supply)',
      'Equipment Supply': 'Equipment Supply',
    },
  },
  {
    id: 'property_type',
    question: 'Is the property non-domestic or domestic?',
    help: 'Non-domestic follows BS 5839-1:2025; domestic follows BS 5839-6:2019.',
    type: 'single',
    options: ['Non-domestic (BS 5839-1)', 'Domestic (BS 5839-6)'],
    suggested: ['Non-domestic (BS 5839-1)'],
  },
  {
    id: 'designed_by',
    question: 'Who has designed the system?',
    type: 'single',
    options: ['Pyrocel', 'Customer / Other'],
    suggested: ['Pyrocel'],
    responses: {
      Pyrocel:
        'The system has been designed by Pyrocel to comply with the standard and category detailed below.',
      'Customer / Other':
        'The system has been designed by the Customer/Other to comply with the standard and category detailed below.',
    },
  },
  {
    id: 'design_category',
    question: 'What BS 5839-1:2025 design category applies?',
    help: 'Use the category from the risk assessment. If none was provided, note it as a variation.',
    type: 'single',
    options: ['M', 'P1', 'P2', 'L1', 'L2', 'L3', 'L4', 'L5', 'Other / HTM 05-03'],
    suggested: ['L3'],
    responses: {
      M: 'The system has been designed to BS 5839 Part 1 2025 to design category M, providing manual alarm only (call points).',
      P1: 'The system has been designed to BS 5839 Part 1 2025 to design category P1, providing automatic fire detection throughout all areas of the building for property protection.',
      P2: 'The system has been designed to BS 5839 Part 1 2025 to design category P2, providing automatic fire detection in specified parts of the building for property protection.',
      L1: 'The Fire Alarm system has been designed to Category L1, BS 5839 Part 1 2025, which satisfies the requirements for a Category M system, but also incorporates automatic fire detectors throughout all areas of the building, other than a small number of specified exceptions.',
      L2: 'The Fire Alarm system has been designed to Category L2, BS 5839 Part 1 2025, which provides cover to defined parts of the building. Identical to a Category L3 system, but with the additional objective of affording early warning of fire in specified areas of high fire risk.',
      L3: 'The Fire Alarm system has been designed to Category L3, BS 5839 Part 1 2025, which provides automatic fire detection to escape routes and all rooms opening on to escape routes. This provides occupants with early warning of the danger, before the escape routes become smoke logged.',
      L4: 'The Fire Alarm system has been designed to Category L4, BS 5839 Part 1 2025, which provides automatic fire detection to escape routes only.',
      L5: 'The Fire Alarm system has been designed to Category L5, BS 5839 Part 1 2025, which provides cover to a particular defined fire safety risk.',
      'Other / HTM 05-03':
        'The system has been designed to HTM 05-03 Hospital Technical Memorandum; Operational Provisions Part B: Fire Detection and Alarm systems.',
    },
  },
  {
    id: 'cabling',
    question: 'What cable type will the system use?',
    type: 'single',
    options: [
      "Soft skin fire resistant — 'standard' (BS 5839-1)",
      "Soft skin fire resistant — 'enhanced' (BS 5839-1)",
      "Mineral insulated — 'enhanced' (BS 5839-1)",
      'Other (specify)',
      'Not applicable',
    ],
    suggested: ["Soft skin fire resistant — 'standard' (BS 5839-1)"],
    responses: {
      "Soft skin fire resistant — 'standard' (BS 5839-1)":
        "The system will utilise soft skin fire resistant cables meeting the 'standard' requirements of BS 5839 Part 1 2025.",
      "Soft skin fire resistant — 'enhanced' (BS 5839-1)":
        "The system will utilise soft skin fire resistant cables meeting the 'enhanced' requirements of BS 5839 Part 1 2025.",
      "Mineral insulated — 'enhanced' (BS 5839-1)":
        "The system will utilise mineral insulated fire resistant cable meeting the 'enhanced' requirements of BS 5839 Part 1 2025.",
    },
  },
  {
    id: 'cause_effect',
    question: 'How should the sounders (cause & effect) be programmed?',
    help: 'If no information is provided, default to one-out-all-out full evacuation.',
    type: 'single',
    options: [
      'Full evacuation immediately (one out, all out)',
      'Information not yet available (request from customer)',
      "In accordance with customer's cause & effect matrix",
      'Other (specify)',
    ],
    suggested: ['Full evacuation immediately (one out, all out)'],
    responses: {
      'Full evacuation immediately (one out, all out)':
        'Sounders will be programmed such that any device in any zone will cause full evacuation immediately.',
      'Information not yet available (request from customer)':
        'Cause & effect information is not available at this stage. We would request the customer to provide this information prior to commencement of the installation process. Please note that should phased evacuation be required, this may have an effect on the system wiring, cable selection and commissioning costs.',
      "In accordance with customer's cause & effect matrix":
        "Sounders will be programmed in accordance with the customer's cause & effect matrix.",
    },
  },
  {
    id: 'sounder_notification',
    question: 'What sounder notification characteristics apply?',
    type: 'single',
    options: ['Standard tone sounders', 'Voice enhanced sounders'],
    suggested: ['Standard tone sounders'],
    responses: {
      'Standard tone sounders':
        "All sounders, sounder/strobes and/or detection devices that incorporate sounder electronics will be commissioned with a single uniform tone (such as the standard 'nee naw' tone).",
      'Voice enhanced sounders':
        'All voice enhanced sounders, sounder/strobes and/or detection devices that incorporate voice enhanced sounder electronics will be commissioned with an attention tone, a programmable pre-speech silence, and a speech message: "Attention please this is an emergency please leave the building by the nearest available exit."',
    },
  },
  {
    id: 'communications',
    question: 'How will the system communicate / signal to the ARC?',
    help: 'Audible only means no automatic communication to the fire and rescue service.',
    type: 'single',
    options: [
      'Audible only',
      'Via existing intruder signalling system',
      'Add:Secure Essential IP (SP4 IP only)',
      'Add:Secure Essential Extra (DP2 GPRS/GPRS)',
      'Add:Secure Advanced (DP2 IP/GPRS)',
      'Add:Secure Advanced Extra (DP4 IP/GPRS)',
      'CSL GradeShift Pro 2 Fire (DP2 GPRS/GPRS)',
      'CSL GradeShift Pro 2 (DP2 IP/GPRS)',
      'CSL GradeShift Pro 2 (DP4 IP/GPRS)',
    ],
    suggested: ['Audible only'],
    responses: {
      'Audible only':
        'The system proposed is audible only and does not communicate automatically with the fire and rescue service. Summoning the fire and rescue service will require manual telephoning using the 999 emergency telephone number.',
      'Via existing intruder signalling system':
        'The system proposed will be connected to the alarm receiving centre (ARC) via the communication system connected to the premises existing intruder alarm system.',
      'Add:Secure Essential IP (SP4 IP only)':
        'The system proposed will be connected to the alarm receiving centre (ARC) via a SP4 graded single path Add:Secure Essential IP. At the earliest possible date, the client must complete and return \u2018SF1517 Keyholder Request Form\u2019 via email to arc@pyrocel.co.uk. Pyrocel require an RJ45 network point and single fused spur (with double pole key switch) to be installed adjacent to the installation location.',
      'Add:Secure Essential Extra (DP2 GPRS/GPRS)':
        'The system proposed will be connected to the alarm receiving centre (ARC) via a DP2 graded dual path Add:Secure Essential Extra. At the earliest possible date, the client must complete and return \u2018SF1517 Keyholder Request Form\u2019 via email to arc@pyrocel.co.uk. Communication hardware requires a single fused spur (with double pole key switch) to be installed adjacent to the installation location.',
      'Add:Secure Advanced (DP2 IP/GPRS)':
        'The system proposed will be connected to the alarm receiving centre (ARC) via a DP2 graded dual path Add:Secure Advanced. At the earliest possible date, the client must complete and return \u2018SF1517 Keyholder Request Form\u2019 via email to arc@pyrocel.co.uk. Pyrocel require an RJ45 network point and single fused spur (with double pole key switch) to be installed adjacent to the installation location.',
      'Add:Secure Advanced Extra (DP4 IP/GPRS)':
        'The system proposed will be connected to the alarm receiving centre (ARC) via a DP4 graded dual path Add:Secure Advanced Extra. At the earliest possible date, the client must complete and return \u2018SF1517 Keyholder Request Form\u2019 via email to arc@pyrocel.co.uk. Pyrocel require an RJ45 network point and single fused spur (with double pole key switch) to be installed adjacent to the installation location.',
      'CSL GradeShift Pro 2 Fire (DP2 GPRS/GPRS)':
        'The system proposed will be connected to the alarm receiving centre (ARC) via a DP2 graded dual path CSL GradeShift Pro 2 Fire. At the earliest possible date, the client must complete and return \u2018SF1517 Keyholder Request Form\u2019 via email to arc@pyrocel.co.uk. Communication hardware requires a single fused spur (with double pole key switch) to be installed adjacent to the installation location.',
      'CSL GradeShift Pro 2 (DP2 IP/GPRS)':
        'The system proposed will be connected to the alarm receiving centre (ARC) via a DP2 graded dual path CSL GradeShift Pro 2. At the earliest possible date, the client must complete and return \u2018SF1517 Keyholder Request Form\u2019 via email to arc@pyrocel.co.uk. Pyrocel require an RJ45 network point and single fused spur (with double pole key switch) to be installed adjacent to the installation location.',
      'CSL GradeShift Pro 2 (DP4 IP/GPRS)':
        'The system proposed will be connected to the alarm receiving centre (ARC) via a DP4 graded dual path CSL GradeShift Pro 2. At the earliest possible date, the client must complete and return \u2018SF1517 Keyholder Request Form\u2019 via email to arc@pyrocel.co.uk. Pyrocel require an RJ45 network point and single fused spur (with double pole key switch) to be installed adjacent to the installation location.',
    },
  },
  {
    id: 'door_actuation',
    question: 'Does the project include actuation of release mechanisms for doors (BS 7273-4)?',
    help: 'Where the category of door actuation is not provided, all doors are assumed Category B (Standard Actuation).',
    type: 'single',
    options: ['No door controls', 'Yes — Category B (Standard) assumed', 'Yes — mixed categories (specify)'],
    suggested: ['No door controls'],
  },
  {
    id: 'existing_system',
    question: 'Is this a modification to an existing system?',
    help: 'Adds the pre-installation engineering survey caveat about spare panel capacity.',
    type: 'single',
    options: ['No — new system', 'Yes — modifying existing system'],
    suggested: ['No — new system'],
    responses: {
      'Yes — modifying existing system':
        'Our quotation is subject to the outcome of a pre-installation engineering survey to confirm that the existing panel has sufficient spare capacity and software capabilities to support the additional devices. For tender purposes, we have assumed that the proposed equipment can be supported by a single existing loop and that the panel is running recent software and is not overloaded. Depending on the age and loading of the panel, additional charges would apply for system upgrading.',
    },
  },
]

// Standard clauses that appear on most fire alarm specifications. The model may
// include the relevant ones when compiling, adapting to the answers above.
export const FIRE_ALARM_STANDARD_CLAUSES = [
  'Power Supply Units: automatic standby power is provided so the system remains fully operational during a mains failure and can sound the audible alarms with all zones in alarm thereafter.',
  'Double Pole Isolating Switch: a key operated double pole isolating switch is required adjacent to the fire alarm panel, provided by others at no cost to Pyrocel, wired in fire rated cable dedicated solely to the fire alarm system, fitted prior to commissioning.',
  'Containment and conduit runs are to be by others at no cost to Pyrocel; wiring will generally be surface run, concealed within the building fabric where practicable and solely at our discretion.',
  'We have made no allowance for builders\u2019 works/making good; cables will be stripped back to walls or ceilings only.',
  'Certification: on completion Pyrocel will provide BS 5839 Part 1 2025 and BAFE Modular certificates for the modules instructed and indicated within System Overview. For systems where Pyrocel provides all modules (design, installation, commissioning/handover) a BAFE Certificate of Compliance will be provided on completion.',
  'Warranty: systems or parts supplied by the Company carry a Parts & Labour warranty of twelve months from date of commissioning, on the basis that the system is maintained in accordance with the manufacturer\u2019s recommended frequencies.',
  'All installation and commissioning work is to be done during normal working hours, Monday to Friday 0830 to 1700 (statutory holidays excepted); any extension caused by the Customer may incur reasonable extra costs.',
  'Before commissioning is carried out the fire alarm system must be fault free; commissioning costs are based on continuous, uninterrupted working.',
]

// The overall section order for a compiled fire alarm specification.
export const FIRE_ALARM_SPEC_SECTIONS = [
  'System Overview (modules quoted)',
  'Scope of Works',
  'Design (standard & category)',
  'Design Variations (state NONE if none)',
  'System Design Particulars (power supplies, isolation, cabling)',
  'Evacuation / Cause & Effect',
  'Sounder Notification Characteristics',
  'Communications & Signalling',
  'Points of Clarification / Compliance',
  'Certification & Warranty',
]

// A compact plain-text summary the model reads as grounding for both steps.
export function fireAlarmKbText(): string {
  const topicLines = FIRE_ALARM_SPEC_TOPICS.map((t) => {
    const resp = t.responses
      ? '\n   Standard responses:\n' +
        Object.entries(t.responses)
          .map(([k, v]) => `     - ${k}: ${v}`)
          .join('\n')
      : ''
    return `- [${t.id}] ${t.question}\n   Options: ${t.options.join(' | ')}\n   Suggested default: ${t.suggested.join(', ')}${resp}`
  }).join('\n')

  return [
    'PYROCEL FIRE DETECTION & ALARM SYSTEM SPECIFICATION KNOWLEDGE BASE (BAFE SP203, BS 5839-1:2025).',
    '',
    'Specification section order:',
    FIRE_ALARM_SPEC_SECTIONS.map((s, i) => `${i + 1}. ${s}`).join('\n'),
    '',
    'Key decision points, their standard options and the exact standard-response wording:',
    topicLines,
    '',
    'Standard clauses to include where relevant:',
    FIRE_ALARM_STANDARD_CLAUSES.map((c) => `- ${c}`).join('\n'),
  ].join('\n')
}
