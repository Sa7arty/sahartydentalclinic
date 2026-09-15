// Patient "Letters" — referrals, medical reports and other official documents,
// each auto-filled from a small set of fields so front-desk staff don't need
// to type the boilerplate wording every time. Add a new letter type here and
// it automatically appears in the patient file's Letters tab.
//
// Fields are dropdowns wherever the real-world answer set is small enough to
// list — staff filling this in with a patient waiting shouldn't have to type
// full sentences. A select field with `allowOther: true` always ends with the
// OTHER_OPTION sentinel, which reveals a one-line free-text field in the UI
// (PatientDetail.tsx) so nothing is ever truly a dead end.

export type LetterFieldType = 'text' | 'textarea' | 'select' | 'number' | 'date'

/** Sentinel last option on any `allowOther` select — picking it reveals a free-text field. */
export const OTHER_OPTION = 'Other (please specify)'

export interface LetterFieldDef {
  key: string
  label: string
  type: LetterFieldType
  placeholder?: string
  options?: string[]
  /** Only meaningful for type 'select': picking OTHER_OPTION reveals a free-text input. */
  allowOther?: boolean
  required?: boolean
  defaultValue?: string
}

export interface LetterTemplateDef {
  key: string
  label: string
  category: string
  fields: LetterFieldDef[]
  /** Builds the letter body as a list of paragraphs (empty string = blank line). */
  buildBody: (patientName: string, values: Record<string, string>) => string[]
  /** Overrides the PDF subtitle / "Re:" title — defaults to the template label. */
  titleOverride?: (values: Record<string, string>) => string
}

const closingNote = 'Please do not hesitate to contact our clinic should you require any further information.'

export const LETTER_TEMPLATES: LetterTemplateDef[] = [
  {
    key: 'referral_radiology',
    label: 'Referral for Imaging (Radiology / CBCT)',
    category: 'Referral',
    fields: [
      {
        key: 'imaging_type',
        label: 'Imaging requested',
        type: 'select',
        options: ['CBCT (Cone Beam CT)', 'Panoramic X-ray (OPG)', 'Periapical X-ray', 'Full CT scan', OTHER_OPTION],
        allowOther: true,
        required: true,
      },
      {
        key: 'region',
        label: 'Region / tooth',
        type: 'select',
        options: [
          'Upper right quadrant',
          'Upper left quadrant',
          'Lower right quadrant',
          'Lower left quadrant',
          'Upper arch (full)',
          'Lower arch (full)',
          'Full upper and lower arches',
          'Anterior region (upper)',
          'Anterior region (lower)',
          'TMJ — right side',
          'TMJ — left side',
          'TMJ — both sides',
          OTHER_OPTION,
        ],
        allowOther: true,
        required: true,
      },
      {
        key: 'reason',
        label: 'Clinical reason',
        type: 'select',
        options: [
          'Pre-implant planning',
          'Suspected impaction',
          'Endodontic evaluation',
          'TMJ evaluation',
          'Orthodontic evaluation',
          'Third molar (wisdom tooth) evaluation',
          'Pathology / lesion evaluation',
          'Post-operative evaluation',
          'Trauma evaluation',
          OTHER_OPTION,
        ],
        allowOther: true,
        required: true,
      },
    ],
    buildBody: (patientName, v) => [
      'Dear Doctor,',
      '',
      `I am referring my patient, ${patientName}, for ${v.imaging_type} of the ${v.region}.`,
      '',
      `Clinical reason: ${v.reason}`,
      '',
      'Kindly perform the requested imaging and share the results with our clinic at your earliest convenience. Thank you for your cooperation.',
    ],
  },
  {
    key: 'referral_specialist',
    label: 'Referral to Physician / Medical Clearance Request',
    category: 'Referral',
    fields: [
      {
        key: 'specialist_type',
        label: 'Specialist',
        type: 'select',
        options: [
          'Cardiologist',
          'Endocrinologist (Diabetes)',
          'Hematologist',
          'Internal Medicine',
          'ENT (Otolaryngologist)',
          'Nephrologist',
          'Pulmonologist',
          'Rheumatologist',
          'Oncologist',
          'Obstetrician / Gynecologist',
          'Pediatrician',
          'Psychiatrist',
          'General Physician',
          OTHER_OPTION,
        ],
        allowOther: true,
        required: true,
      },
      {
        key: 'planned_procedure',
        label: 'Planned dental procedure',
        type: 'select',
        options: [
          'Surgical extraction',
          'Simple extraction',
          'Multiple extractions',
          'Implant placement',
          'Root canal treatment',
          'Periodontal surgery',
          'Crown / bridge preparation',
          'Scaling and root planing',
          'Orthodontic treatment',
          'General dental treatment under sedation',
          OTHER_OPTION,
        ],
        allowOther: true,
        required: true,
      },
      {
        key: 'reason',
        label: 'Reason for referral',
        type: 'select',
        options: [
          'Medical clearance before extraction',
          'Medical clearance before surgical procedure',
          'Medical clearance before implant placement',
          'Anticoagulant / antiplatelet therapy review',
          'Antibiotic prophylaxis recommendation',
          'Uncontrolled diabetes management',
          'Cardiac condition evaluation',
          'Renal condition evaluation',
          'Pregnancy-related precautions',
          OTHER_OPTION,
        ],
        allowOther: true,
        required: true,
      },
    ],
    buildBody: (patientName, v) => [
      'Dear Doctor,',
      '',
      `My patient, ${patientName}, is scheduled to undergo ${v.planned_procedure} at our clinic.`,
      '',
      `Given the patient's medical history, I would like to kindly request your medical clearance and any recommendations prior to proceeding with this treatment.`,
      '',
      `Reason for referral: ${v.reason}`,
      '',
      closingNote,
    ],
  },
  {
    key: 'referral_dental_specialist',
    label: 'Referral to Dental Specialist',
    category: 'Referral',
    fields: [
      {
        key: 'specialist_type',
        label: 'Specialist',
        type: 'select',
        options: ['Orthodontist', 'Periodontist', 'Endodontist', 'Oral & Maxillofacial Surgeon', 'Prosthodontist', 'Pediatric Dentist', OTHER_OPTION],
        allowOther: true,
        required: true,
      },
      {
        key: 'reason',
        label: 'Reason for referral',
        type: 'select',
        options: [
          'Orthodontic evaluation and treatment',
          'Periodontal evaluation and treatment',
          'Root canal treatment (endodontic)',
          'Surgical extraction / impacted tooth',
          'Prosthodontic rehabilitation (crowns / bridges / dentures)',
          'Pediatric dental care',
          'Implant placement',
          'TMJ disorder evaluation',
          'Oral pathology evaluation',
          OTHER_OPTION,
        ],
        allowOther: true,
        required: true,
      },
    ],
    buildBody: (patientName, v) => [
      'Dear Doctor,',
      '',
      `I am referring my patient, ${patientName}, to a ${v.specialist_type} for further evaluation and management.`,
      '',
      `Reason for referral: ${v.reason}`,
      '',
      closingNote,
    ],
  },
  {
    key: 'medical_report_rest',
    label: 'Medical Report & Rest Certificate',
    category: 'Medical report',
    fields: [
      {
        key: 'procedure',
        label: 'Procedure performed',
        type: 'select',
        options: [
          'Surgical extraction',
          'Simple extraction',
          'Multiple extractions',
          'Root canal treatment',
          'Implant placement',
          'Periodontal surgery',
          'Crown / bridge preparation',
          'Impacted wisdom tooth removal',
          OTHER_OPTION,
        ],
        allowOther: true,
        required: true,
      },
      { key: 'procedure_date', label: 'Procedure date', type: 'date', required: true },
      { key: 'rest_days', label: 'Rest days advised', type: 'number', placeholder: 'e.g. 2', required: true },
      { key: 'notes', label: 'Additional notes (optional)', type: 'textarea' },
    ],
    buildBody: (patientName, v) => [
      `This is to certify that ${patientName} underwent ${v.procedure} at Saharty Dental Clinic on ${v.procedure_date}.`,
      '',
      `Following this procedure, the patient is advised to rest for ${v.rest_days} day(s) starting from the above date.`,
      ...(v.notes ? ['', v.notes] : []),
      '',
      "This report is issued upon the patient's request for official purposes.",
    ],
  },
  {
    key: 'sick_leave',
    label: 'Sick Leave Certificate',
    category: 'Medical report',
    fields: [
      { key: 'start_date', label: 'Leave start date', type: 'date', required: true },
      { key: 'leave_days', label: 'Number of days', type: 'number', placeholder: 'e.g. 2', required: true },
      {
        key: 'purpose',
        label: 'Issued for',
        type: 'select',
        options: ["submission to the patient's employer", "submission to the patient's school/university", 'official documentation', OTHER_OPTION],
        allowOther: true,
        defaultValue: "submission to the patient's employer",
        required: true,
      },
    ],
    buildBody: (patientName, v) => [
      `This is to certify that ${patientName} attended Saharty Dental Clinic and, due to a dental condition requiring treatment, is advised to take ${v.leave_days} day(s) of sick leave starting ${v.start_date}.`,
      '',
      `This certificate is issued for ${v.purpose}.`,
    ],
  },
  {
    key: 'cost_confirmation',
    label: 'Treatment Cost Confirmation Letter',
    category: 'Administrative',
    fields: [
      { key: 'procedure', label: 'Treatment performed', type: 'textarea', placeholder: 'e.g. root canal treatment on tooth #36, followed by crown placement', required: true },
      { key: 'amount', label: 'Total cost', type: 'text', placeholder: 'e.g. 5,000', required: true },
      {
        key: 'purpose',
        label: 'Issued for',
        type: 'select',
        options: ['insurance reimbursement purposes', "submission to the patient's employer", 'official documentation', OTHER_OPTION],
        allowOther: true,
        defaultValue: 'insurance reimbursement purposes',
        required: true,
      },
    ],
    buildBody: (patientName, v) => [
      `This is to confirm that ${patientName} underwent the following treatment at Saharty Dental Clinic: ${v.procedure}.`,
      '',
      `The total cost of the above treatment is ${v.amount}.`,
      '',
      `This letter is issued for ${v.purpose}.`,
    ],
  },
  {
    key: 'attendance_certificate',
    label: 'Certificate of Attendance',
    category: 'Administrative',
    fields: [
      { key: 'visit_dates', label: 'Visit date(s)', type: 'text', placeholder: 'e.g. 12/08/2026', required: true },
      {
        key: 'purpose',
        label: 'Issued for',
        type: 'select',
        options: ['whom it may concern', "submission to the patient's employer", 'submission to school/university', 'insurance purposes', OTHER_OPTION],
        allowOther: true,
        defaultValue: 'whom it may concern',
        required: true,
      },
    ],
    buildBody: (patientName, v) => [
      `This is to certify that ${patientName} attended Saharty Dental Clinic on ${v.visit_dates} for dental treatment.`,
      '',
      `This certificate is issued for ${v.purpose}.`,
    ],
  },
  {
    key: 'custom',
    label: 'Custom Letter (blank)',
    category: 'Administrative',
    fields: [
      { key: 'subject', label: 'Letter title', type: 'text', placeholder: 'e.g. To Whom It May Concern', required: true },
      { key: 'body', label: 'Letter body', type: 'textarea', placeholder: 'Write the letter freely — each blank line starts a new paragraph.', required: true },
    ],
    titleOverride: (v) => v.subject || 'Letter',
    buildBody: (_patientName, v) => (v.body || '').split(/\n\s*\n/).map((p) => p.trim()),
  },
]

export function getLetterTemplate(key: string): LetterTemplateDef | undefined {
  return LETTER_TEMPLATES.find((t) => t.key === key)
}
