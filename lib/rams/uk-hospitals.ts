export interface Hospital {
  id: string
  name: string
  type: 'A&E' | 'UTC' | 'A&E + UTC'
  address: string
  postcode: string
  phone: string
  services: string[]
  openingHours: string
  notes?: string
  latitude: number
  longitude: number
}

export interface HospitalRegion {
  region: string
  hospitals: Hospital[]
}

// Major UK hospitals with A&E and UTC facilities
// This is a representative list - can be expanded
export const ukHospitals: Hospital[] = [
  // North East
  {
    id: 'rvi-newcastle',
    name: 'Royal Victoria Infirmary (RVI)',
    type: 'A&E + UTC',
    address: 'Queen Victoria Road, Newcastle upon Tyne',
    postcode: 'NE1 4LP',
    phone: '0191 233 6161',
    services: [
      'Major Trauma Centre',
      '24/7 Emergency Department',
      'Urgent Treatment Centre (UTC)',
      'Paediatric A&E',
      'Burns Unit'
    ],
    openingHours: '24 hours, 7 days a week',
    notes: 'The UTC is located on the same site and allows walk-in assessment without appointment.',
    latitude: 54.9803,
    longitude: -1.6178
  },
  {
    id: 'freeman-newcastle',
    name: 'Freeman Hospital',
    type: 'A&E',
    address: 'Freeman Road, High Heaton, Newcastle upon Tyne',
    postcode: 'NE7 7DN',
    phone: '0191 233 6161',
    services: [
      'Cardiothoracic Centre',
      'Transplant Unit',
      'Renal Services'
    ],
    openingHours: '24 hours, 7 days a week',
    latitude: 55.0022,
    longitude: -1.5847
  },
  {
    id: 'james-cook-middlesbrough',
    name: 'James Cook University Hospital',
    type: 'A&E + UTC',
    address: 'Marton Road, Middlesbrough',
    postcode: 'TS4 3BW',
    phone: '01642 850850',
    services: [
      'Major Trauma Centre',
      '24/7 Emergency Department',
      'Urgent Treatment Centre',
      'Specialist Burns Unit'
    ],
    openingHours: '24 hours, 7 days a week',
    latitude: 54.5519,
    longitude: -1.2116
  },
  {
    id: 'sunderland-royal',
    name: 'Sunderland Royal Hospital',
    type: 'A&E + UTC',
    address: 'Kayll Road, Sunderland',
    postcode: 'SR4 7TP',
    phone: '0191 565 6256',
    services: [
      '24/7 Emergency Department',
      'Urgent Treatment Centre',
      'Stroke Unit'
    ],
    openingHours: '24 hours, 7 days a week',
    latitude: 54.8989,
    longitude: -1.4088
  },
  {
    id: 'university-hospital-durham',
    name: 'University Hospital of North Durham',
    type: 'A&E + UTC',
    address: 'North Road, Durham',
    postcode: 'DH1 5TW',
    phone: '0191 333 2333',
    services: [
      '24/7 Emergency Department',
      'Urgent Treatment Centre',
      'Acute Medical Unit'
    ],
    openingHours: '24 hours, 7 days a week',
    latitude: 54.7867,
    longitude: -1.5736
  },
  {
    id: 'nsech-cramlington',
    name: 'Northumbria Specialist Emergency Care Hospital (NSECH)',
    type: 'A&E',
    address: 'Northumbria Way, Cramlington',
    postcode: 'NE23 6NZ',
    phone: '0344 811 8111',
    services: [
      '24/7 Consultant-led Emergency Department',
      'Specialist Emergency Care',
      'Acute Medical Unit',
      'Paediatric Emergency Care',
      'Maternity & Special Care Baby Unit'
    ],
    openingHours: '24 hours, 7 days a week',
    notes: 'The North East\'s dedicated emergency care hospital, consultant-led 24/7. For minor injuries, use the UTCs at North Tyneside, Wansbeck or Hexham General.',
    latitude: 55.0876,
    longitude: -1.5847
  },
  {
    id: 'north-tyneside-utc',
    name: 'North Tyneside General Hospital (UTC)',
    type: 'UTC',
    address: 'Rake Lane, North Shields',
    postcode: 'NE29 8NH',
    phone: '0344 811 8111',
    services: [
      'Urgent Treatment Centre',
      'Minor Injuries',
      'X-ray Facilities'
    ],
    openingHours: '24 hours, 7 days a week',
    notes: 'Walk-in urgent treatment for non-life-threatening injuries. Serious emergencies are handled at NSECH Cramlington.',
    latitude: 55.0156,
    longitude: -1.4543
  },
  {
    id: 'wansbeck-utc',
    name: 'Wansbeck General Hospital (UTC)',
    type: 'UTC',
    address: 'Woodhorn Lane, Ashington',
    postcode: 'NE63 9JJ',
    phone: '0344 811 8111',
    services: [
      'Urgent Treatment Centre',
      'Minor Injuries',
      'X-ray Facilities'
    ],
    openingHours: '24 hours, 7 days a week',
    notes: 'Walk-in urgent treatment for non-life-threatening injuries. Serious emergencies are handled at NSECH Cramlington.',
    latitude: 55.1881,
    longitude: -1.5747
  },
  {
    id: 'hexham-utc',
    name: 'Hexham General Hospital (UTC)',
    type: 'UTC',
    address: 'Corbridge Road, Hexham',
    postcode: 'NE46 1QJ',
    phone: '0344 811 8111',
    services: [
      'Urgent Treatment Centre',
      'Minor Injuries',
      'X-ray Facilities'
    ],
    openingHours: '24 hours, 7 days a week',
    notes: 'Walk-in urgent treatment for non-life-threatening injuries. Serious emergencies are handled at NSECH Cramlington.',
    latitude: 54.9669,
    longitude: -2.0934
  },
  {
    id: 'qe-gateshead',
    name: 'Queen Elizabeth Hospital Gateshead',
    type: 'A&E + UTC',
    address: 'Sheriff Hill, Gateshead',
    postcode: 'NE9 6SX',
    phone: '0191 482 0000',
    services: [
      '24/7 Emergency Department',
      'Urgent Treatment Centre',
      'Acute Medical Unit',
      'Maternity Services'
    ],
    openingHours: '24 hours, 7 days a week',
    latitude: 54.9347,
    longitude: -1.5934
  },
  {
    id: 'south-tyneside',
    name: 'South Tyneside District Hospital',
    type: 'UTC',
    address: 'Harton Lane, South Shields',
    postcode: 'NE34 0PL',
    phone: '0191 404 1000',
    services: [
      'Urgent Treatment Centre',
      'Minor Injuries',
      'X-ray Facilities'
    ],
    openingHours: '24 hours, 7 days a week',
    notes: 'Urgent treatment centre for non-life-threatening injuries. Serious emergencies are directed to Sunderland Royal or South Tyneside emergency pathways.',
    latitude: 54.9759,
    longitude: -1.4297
  },
  {
    id: 'darlington-memorial',
    name: 'Darlington Memorial Hospital',
    type: 'A&E + UTC',
    address: 'Hollyhurst Road, Darlington',
    postcode: 'DL3 6HX',
    phone: '01325 380100',
    services: [
      '24/7 Emergency Department',
      'Urgent Treatment Centre',
      'Acute Medical Unit'
    ],
    openingHours: '24 hours, 7 days a week',
    latitude: 54.5311,
    longitude: -1.5621
  },
  {
    id: 'university-hospital-hartlepool',
    name: 'University Hospital of Hartlepool (UTC)',
    type: 'UTC',
    address: 'Holdforth Road, Hartlepool',
    postcode: 'TS24 9AH',
    phone: '01429 266654',
    services: [
      'Urgent Treatment Centre',
      'Minor Injuries',
      'X-ray Facilities'
    ],
    openingHours: '8am - 10pm, 7 days a week',
    notes: 'Walk-in urgent treatment. Serious emergencies are handled at University Hospital of North Tees, Stockton.',
    latitude: 54.6907,
    longitude: -1.2156
  },
  {
    id: 'university-hospital-north-tees',
    name: 'University Hospital of North Tees',
    type: 'A&E + UTC',
    address: 'Hardwick Road, Stockton-on-Tees',
    postcode: 'TS19 8PE',
    phone: '01642 617617',
    services: [
      '24/7 Emergency Department',
      'Urgent Treatment Centre',
      'Acute Medical Unit'
    ],
    openingHours: '24 hours, 7 days a week',
    latitude: 54.5747,
    longitude: -1.3389
  },
  {
    id: 'bishop-auckland-utc',
    name: 'Bishop Auckland Hospital (UTC)',
    type: 'UTC',
    address: 'Cockton Hill Road, Bishop Auckland',
    postcode: 'DL14 6AD',
    phone: '01388 455000',
    services: [
      'Urgent Treatment Centre',
      'Minor Injuries',
      'X-ray Facilities'
    ],
    openingHours: '24 hours, 7 days a week',
    notes: 'Walk-in urgent treatment for non-life-threatening injuries. Serious emergencies are handled at University Hospital of North Durham or Darlington Memorial.',
    latitude: 54.6589,
    longitude: -1.6789
  },
  // North West
  {
    id: 'manchester-royal-infirmary',
    name: 'Manchester Royal Infirmary',
    type: 'A&E + UTC',
    address: 'Oxford Road, Manchester',
    postcode: 'M13 9WL',
    phone: '0161 276 1234',
    services: [
      'Major Trauma Centre',
      '24/7 Emergency Department',
      'Urgent Treatment Centre',
      'Burns Centre'
    ],
    openingHours: '24 hours, 7 days a week',
    latitude: 53.4615,
    longitude: -2.2265
  },
  {
    id: 'salford-royal',
    name: 'Salford Royal Hospital',
    type: 'A&E + UTC',
    address: 'Stott Lane, Salford',
    postcode: 'M6 8HD',
    phone: '0161 789 7373',
    services: [
      'Major Trauma Centre',
      '24/7 Emergency Department',
      'Neurosciences Centre',
      'Stroke Centre'
    ],
    openingHours: '24 hours, 7 days a week',
    latitude: 53.4878,
    longitude: -2.3256
  },
  {
    id: 'royal-liverpool',
    name: 'Royal Liverpool University Hospital',
    type: 'A&E + UTC',
    address: 'Prescot Street, Liverpool',
    postcode: 'L7 8XP',
    phone: '0151 706 2000',
    services: [
      '24/7 Emergency Department',
      'Urgent Treatment Centre',
      'Major Trauma Centre'
    ],
    openingHours: '24 hours, 7 days a week',
    latitude: 53.4035,
    longitude: -2.9668
  },
  {
    id: 'royal-preston',
    name: 'Royal Preston Hospital',
    type: 'A&E + UTC',
    address: 'Sharoe Green Lane, Preston',
    postcode: 'PR2 9HT',
    phone: '01772 716565',
    services: [
      'Major Trauma Centre',
      '24/7 Emergency Department',
      'Urgent Treatment Centre'
    ],
    openingHours: '24 hours, 7 days a week',
    latitude: 53.7832,
    longitude: -2.7078
  },
  // Yorkshire
  {
    id: 'leeds-general',
    name: 'Leeds General Infirmary',
    type: 'A&E + UTC',
    address: 'Great George Street, Leeds',
    postcode: 'LS1 3EX',
    phone: '0113 243 2799',
    services: [
      'Major Trauma Centre',
      '24/7 Emergency Department',
      'Urgent Treatment Centre',
      'Paediatric A&E'
    ],
    openingHours: '24 hours, 7 days a week',
    latitude: 53.8013,
    longitude: -1.5509
  },
  {
    id: 'st-james-leeds',
    name: "St James's University Hospital",
    type: 'A&E',
    address: 'Beckett Street, Leeds',
    postcode: 'LS9 7TF',
    phone: '0113 243 3144',
    services: [
      '24/7 Emergency Department',
      'Oncology Centre',
      'Renal Unit'
    ],
    openingHours: '24 hours, 7 days a week',
    latitude: 53.8060,
    longitude: -1.5203
  },
  {
    id: 'sheffield-northern-general',
    name: 'Northern General Hospital',
    type: 'A&E + UTC',
    address: 'Herries Road, Sheffield',
    postcode: 'S5 7AU',
    phone: '0114 243 4343',
    services: [
      'Major Trauma Centre',
      '24/7 Emergency Department',
      'Urgent Treatment Centre',
      'Spinal Injuries Centre'
    ],
    openingHours: '24 hours, 7 days a week',
    latitude: 53.4149,
    longitude: -1.4610
  },
  {
    id: 'hull-royal',
    name: 'Hull Royal Infirmary',
    type: 'A&E + UTC',
    address: 'Anlaby Road, Hull',
    postcode: 'HU3 2JZ',
    phone: '01482 875875',
    services: [
      'Major Trauma Centre',
      '24/7 Emergency Department',
      'Urgent Treatment Centre'
    ],
    openingHours: '24 hours, 7 days a week',
    latitude: 53.7435,
    longitude: -0.3584
  },
  {
    id: 'york-hospital',
    name: 'York Hospital',
    type: 'A&E + UTC',
    address: 'Wigginton Road, York',
    postcode: 'YO31 8HE',
    phone: '01904 631313',
    services: [
      '24/7 Emergency Department',
      'Urgent Treatment Centre',
      'Stroke Unit'
    ],
    openingHours: '24 hours, 7 days a week',
    latitude: 53.9730,
    longitude: -1.0736
  },
  // Midlands
  {
    id: 'qe-birmingham',
    name: 'Queen Elizabeth Hospital Birmingham',
    type: 'A&E + UTC',
    address: 'Mindelsohn Way, Birmingham',
    postcode: 'B15 2GW',
    phone: '0121 627 2000',
    services: [
      'Major Trauma Centre',
      '24/7 Emergency Department',
      'Urgent Treatment Centre',
      'Burns Centre',
      'Military Rehabilitation'
    ],
    openingHours: '24 hours, 7 days a week',
    latitude: 52.4534,
    longitude: -1.9385
  },
  {
    id: 'nottingham-qmc',
    name: "Queen's Medical Centre Nottingham",
    type: 'A&E + UTC',
    address: 'Derby Road, Nottingham',
    postcode: 'NG7 2UH',
    phone: '0115 924 9924',
    services: [
      'Major Trauma Centre',
      '24/7 Emergency Department',
      'Urgent Treatment Centre',
      'Paediatric A&E'
    ],
    openingHours: '24 hours, 7 days a week',
    latitude: 52.9422,
    longitude: -1.1847
  },
  {
    id: 'leicester-royal',
    name: 'Leicester Royal Infirmary',
    type: 'A&E + UTC',
    address: 'Infirmary Square, Leicester',
    postcode: 'LE1 5WW',
    phone: '0300 303 1573',
    services: [
      '24/7 Emergency Department',
      'Urgent Treatment Centre',
      'Children\'s Hospital'
    ],
    openingHours: '24 hours, 7 days a week',
    latitude: 52.6263,
    longitude: -1.1365
  },
  // London
  {
    id: 'st-thomas-london',
    name: "St Thomas' Hospital",
    type: 'A&E + UTC',
    address: 'Westminster Bridge Road, London',
    postcode: 'SE1 7EH',
    phone: '020 7188 7188',
    services: [
      'Major Trauma Centre',
      '24/7 Emergency Department',
      'Urgent Treatment Centre',
      'Evelina Children\'s Hospital'
    ],
    openingHours: '24 hours, 7 days a week',
    latitude: 51.4987,
    longitude: -0.1175
  },
  {
    id: 'royal-london',
    name: 'Royal London Hospital',
    type: 'A&E + UTC',
    address: 'Whitechapel Road, London',
    postcode: 'E1 1FR',
    phone: '020 7377 7000',
    services: [
      'Major Trauma Centre',
      '24/7 Emergency Department',
      'Urgent Treatment Centre',
      'Air Ambulance Base',
      'Helicopter Landing'
    ],
    openingHours: '24 hours, 7 days a week',
    latitude: 51.5186,
    longitude: -0.0596
  },
  {
    id: 'kings-college-london',
    name: "King's College Hospital",
    type: 'A&E + UTC',
    address: 'Denmark Hill, London',
    postcode: 'SE5 9RS',
    phone: '020 3299 9000',
    services: [
      'Major Trauma Centre',
      '24/7 Emergency Department',
      'Urgent Treatment Centre',
      'Liver Unit'
    ],
    openingHours: '24 hours, 7 days a week',
    latitude: 51.4684,
    longitude: -0.0940
  },
  {
    id: 'ucl-hospital',
    name: 'University College Hospital',
    type: 'A&E + UTC',
    address: '235 Euston Road, London',
    postcode: 'NW1 2BU',
    phone: '0845 155 5000',
    services: [
      '24/7 Emergency Department',
      'Urgent Treatment Centre',
      'Cancer Centre'
    ],
    openingHours: '24 hours, 7 days a week',
    latitude: 51.5249,
    longitude: -0.1358
  },
  {
    id: 'st-marys-london',
    name: "St Mary's Hospital",
    type: 'A&E + UTC',
    address: 'Praed Street, Paddington, London',
    postcode: 'W2 1NY',
    phone: '020 3312 6666',
    services: [
      'Major Trauma Centre',
      '24/7 Emergency Department',
      'Urgent Treatment Centre'
    ],
    openingHours: '24 hours, 7 days a week',
    latitude: 51.5170,
    longitude: -0.1742
  },
  // South East
  {
    id: 'john-radcliffe-oxford',
    name: 'John Radcliffe Hospital',
    type: 'A&E + UTC',
    address: 'Headley Way, Headington, Oxford',
    postcode: 'OX3 9DU',
    phone: '01865 741166',
    services: [
      'Major Trauma Centre',
      '24/7 Emergency Department',
      'Urgent Treatment Centre',
      'Children\'s Hospital'
    ],
    openingHours: '24 hours, 7 days a week',
    latitude: 51.7636,
    longitude: -1.2197
  },
  {
    id: 'southampton-general',
    name: 'Southampton General Hospital',
    type: 'A&E + UTC',
    address: 'Tremona Road, Southampton',
    postcode: 'SO16 6YD',
    phone: '023 8077 7222',
    services: [
      'Major Trauma Centre',
      '24/7 Emergency Department',
      'Urgent Treatment Centre',
      'Children\'s Hospital'
    ],
    openingHours: '24 hours, 7 days a week',
    latitude: 50.9335,
    longitude: -1.4343
  },
  {
    id: 'brighton-royal-sussex',
    name: 'Royal Sussex County Hospital',
    type: 'A&E + UTC',
    address: 'Eastern Road, Brighton',
    postcode: 'BN2 5BE',
    phone: '01273 696955',
    services: [
      'Major Trauma Centre',
      '24/7 Emergency Department',
      'Urgent Treatment Centre'
    ],
    openingHours: '24 hours, 7 days a week',
    latitude: 50.8205,
    longitude: -0.1103
  },
  // South West
  {
    id: 'southmead-bristol',
    name: 'Southmead Hospital',
    type: 'A&E + UTC',
    address: 'Southmead Road, Bristol',
    postcode: 'BS10 5NB',
    phone: '0117 950 5050',
    services: [
      'Major Trauma Centre',
      '24/7 Emergency Department',
      'Urgent Treatment Centre',
      'Neurosciences Centre'
    ],
    openingHours: '24 hours, 7 days a week',
    latitude: 51.5008,
    longitude: -2.5953
  },
  {
    id: 'derriford-plymouth',
    name: 'Derriford Hospital',
    type: 'A&E + UTC',
    address: 'Derriford Road, Plymouth',
    postcode: 'PL6 8DH',
    phone: '01752 202082',
    services: [
      'Major Trauma Centre',
      '24/7 Emergency Department',
      'Urgent Treatment Centre'
    ],
    openingHours: '24 hours, 7 days a week',
    latitude: 50.4169,
    longitude: -4.1133
  },
  {
    id: 'royal-devon-exeter',
    name: 'Royal Devon and Exeter Hospital',
    type: 'A&E + UTC',
    address: 'Barrack Road, Exeter',
    postcode: 'EX2 5DW',
    phone: '01392 411611',
    services: [
      '24/7 Emergency Department',
      'Urgent Treatment Centre',
      'Princess Elizabeth Orthopaedic Centre'
    ],
    openingHours: '24 hours, 7 days a week',
    latitude: 50.7148,
    longitude: -3.4977
  },
  // Wales
  {
    id: 'university-hospital-wales',
    name: 'University Hospital of Wales',
    type: 'A&E + UTC',
    address: 'Heath Park, Cardiff',
    postcode: 'CF14 4XW',
    phone: '029 2074 7747',
    services: [
      'Major Trauma Centre',
      '24/7 Emergency Department',
      'Urgent Treatment Centre',
      'Children\'s Hospital for Wales'
    ],
    openingHours: '24 hours, 7 days a week',
    latitude: 51.5082,
    longitude: -3.1903
  },
  {
    id: 'morriston-swansea',
    name: 'Morriston Hospital',
    type: 'A&E + UTC',
    address: 'Heol Maes Eglwys, Swansea',
    postcode: 'SA6 6NL',
    phone: '01792 702222',
    services: [
      '24/7 Emergency Department',
      'Urgent Treatment Centre',
      'Burns Centre Wales'
    ],
    openingHours: '24 hours, 7 days a week',
    latitude: 51.6847,
    longitude: -3.9365
  },
  // Scotland
  {
    id: 'glasgow-royal-infirmary',
    name: 'Glasgow Royal Infirmary',
    type: 'A&E + UTC',
    address: '84 Castle Street, Glasgow',
    postcode: 'G4 0SF',
    phone: '0141 211 4000',
    services: [
      'Major Trauma Centre',
      '24/7 Emergency Department',
      'Urgent Treatment Centre'
    ],
    openingHours: '24 hours, 7 days a week',
    latitude: 55.8631,
    longitude: -4.2363
  },
  {
    id: 'qe-university-glasgow',
    name: 'Queen Elizabeth University Hospital',
    type: 'A&E + UTC',
    address: '1345 Govan Road, Glasgow',
    postcode: 'G51 4TF',
    phone: '0141 201 1100',
    services: [
      'Major Trauma Centre',
      '24/7 Emergency Department',
      'Urgent Treatment Centre',
      'Royal Hospital for Children'
    ],
    openingHours: '24 hours, 7 days a week',
    latitude: 55.8619,
    longitude: -4.3411
  },
  {
    id: 'edinburgh-royal-infirmary',
    name: 'Royal Infirmary of Edinburgh',
    type: 'A&E + UTC',
    address: '51 Little France Crescent, Edinburgh',
    postcode: 'EH16 4SA',
    phone: '0131 536 1000',
    services: [
      'Major Trauma Centre',
      '24/7 Emergency Department',
      'Urgent Treatment Centre'
    ],
    openingHours: '24 hours, 7 days a week',
    latitude: 55.9214,
    longitude: -3.1356
  },
  {
    id: 'ninewells-dundee',
    name: 'Ninewells Hospital',
    type: 'A&E + UTC',
    address: 'Ninewells, Dundee',
    postcode: 'DD1 9SY',
    phone: '01382 660111',
    services: [
      'Major Trauma Centre',
      '24/7 Emergency Department',
      'Urgent Treatment Centre'
    ],
    openingHours: '24 hours, 7 days a week',
    latitude: 56.4575,
    longitude: -3.0163
  },
  {
    id: 'aberdeen-royal-infirmary',
    name: 'Aberdeen Royal Infirmary',
    type: 'A&E + UTC',
    address: 'Foresterhill, Aberdeen',
    postcode: 'AB25 2ZN',
    phone: '0345 456 6000',
    services: [
      'Major Trauma Centre',
      '24/7 Emergency Department',
      'Urgent Treatment Centre'
    ],
    openingHours: '24 hours, 7 days a week',
    latitude: 57.1536,
    longitude: -2.1368
  },
  // Northern Ireland
  {
    id: 'royal-victoria-belfast',
    name: 'Royal Victoria Hospital Belfast',
    type: 'A&E + UTC',
    address: '274 Grosvenor Road, Belfast',
    postcode: 'BT12 6BA',
    phone: '028 9024 0503',
    services: [
      'Major Trauma Centre',
      '24/7 Emergency Department',
      'Urgent Treatment Centre'
    ],
    openingHours: '24 hours, 7 days a week',
    latitude: 54.5931,
    longitude: -5.9553
  },
  {
    id: 'ulster-hospital',
    name: 'Ulster Hospital',
    type: 'A&E + UTC',
    address: 'Upper Newtownards Road, Dundonald, Belfast',
    postcode: 'BT16 1RH',
    phone: '028 9048 4511',
    services: [
      '24/7 Emergency Department',
      'Urgent Treatment Centre'
    ],
    openingHours: '24 hours, 7 days a week',
    latitude: 54.5678,
    longitude: -5.8456
  }
]

// Calculate distance between two points using Haversine formula
export function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3959 // Earth's radius in miles
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

// Get hospitals sorted by distance from a postcode
export async function getHospitalsByPostcode(postcode: string): Promise<(Hospital & { distance: number })[]> {
  try {
    // Use postcodes.io API to get coordinates
    const response = await fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(postcode.replace(/\s/g, ''))}`)
    const data = await response.json()
    
    if (!data.result) {
      return ukHospitals.map(h => ({ ...h, distance: 0 }))
    }
    
    const { latitude, longitude } = data.result
    
    // Calculate distance for each hospital and sort
    const hospitalsWithDistance = ukHospitals.map(hospital => ({
      ...hospital,
      distance: calculateDistance(latitude, longitude, hospital.latitude, hospital.longitude)
    }))
    
    return hospitalsWithDistance.sort((a, b) => a.distance - b.distance)
  } catch (error) {
    console.error('Error fetching postcode data:', error)
    return ukHospitals.map(h => ({ ...h, distance: 0 }))
  }
}

// Generate emergency text for a hospital
export function generateEmergencyText(hospital: Hospital): string {
  const hasUTC = hospital.type.includes('UTC')
  
  let text = `In the event of a serious or life-threatening emergency, dial 999 for an ambulance or proceed directly to ${hospital.name} Emergency Department (${hospital.address}, ${hospital.postcode}; Tel: ${hospital.phone}).`
  
  if (hasUTC) {
    text += ` For non-life-threatening but urgent injuries (e.g., sprains, minor burns, or suspected broken bones), a dedicated Urgent Treatment Centre (UTC) is located on the same site. This facility is open ${hospital.openingHours.toLowerCase()} and allows for immediate walk-in assessment without a prior appointment.`
  }
  
  return text
}
