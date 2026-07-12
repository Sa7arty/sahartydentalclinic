import { SupabaseClient } from '@supabase/supabase-js'

const IMPORT_COLUMNS = [
  'first_name', 'middle_name', 'last_name', 'gender', 'date_of_birth',
  'nationality', 'national_id', 'occupation', 'phone', 'phone_secondary', 'email',
  'country', 'city', 'district', 'address', 'medical_history', 'notes',
]

function toCsvValue(v: unknown): string {
  if (v === null || v === undefined) return ''
  const s = String(v)
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
}

function downloadTextFile(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export function exportPatientsCsv(patients: any[]) {
  const columns = ['file_number', ...IMPORT_COLUMNS, 'provider']
  const header = columns.join(',')
  const rows = patients.map((p) => {
    const provider = p.provider ? `${p.provider.first_name} ${p.provider.last_name}`.trim() : ''
    const values = columns.map((c) => (c === 'provider' ? provider : p[c]))
    return values.map(toCsvValue).join(',')
  })
  downloadTextFile(`patients-export-${new Date().toISOString().slice(0, 10)}.csv`, [header, ...rows].join('\n'))
}

export function downloadPatientImportTemplate() {
  const header = IMPORT_COLUMNS.join(',')
  const example = [
    'Ahmed', 'Sami', 'Nabil', 'male', '1990-01-01', 'Egypt', '29001011234567', 'Teacher',
    '01012345678', '', 'ahmed@example.com', 'Egypt', 'Cairo', 'Maadi', '12 Road 9', 'No known allergies', '',
  ].map(toCsvValue).join(',')
  downloadTextFile('patient-import-template.csv', [header, example].join('\n'))
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else inQuotes = false
      } else field += c
    } else if (c === '"') {
      inQuotes = true
    } else if (c === ',') {
      row.push(field)
      field = ''
    } else if (c === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else if (c === '\r') {
      // skip
    } else {
      field += c
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  return rows.filter((r) => !(r.length === 1 && r[0] === ''))
}

export async function importPatientsFromCsv(
  file: File,
  supabase: SupabaseClient,
  _autoGenerateFileNumber: boolean,
): Promise<{ success: number; failed: number }> {
  const text = await file.text()
  const rows = parseCsv(text)
  if (rows.length < 2) return { success: 0, failed: 0 }

  const header = rows[0].map((h) => h.trim())
  const dataRows = rows.slice(1)

  let success = 0
  let failed = 0
  for (const row of dataRows) {
    const record: Record<string, unknown> = {}
    header.forEach((col, i) => {
      if (!IMPORT_COLUMNS.includes(col)) return
      const value = (row[i] ?? '').trim()
      record[col] = value === '' ? null : value
    })
    if (!record.first_name || !record.last_name) {
      failed++
      console.error('Skipped row (missing first/last name):', row)
      continue
    }
    if (record.gender && record.gender !== 'male' && record.gender !== 'female') {
      record.gender = null
    }
    const { error } = await supabase.from('patients').insert(record)
    if (error) {
      failed++
      console.error('Import row failed:', row, error.message)
    } else {
      success++
    }
  }
  return { success, failed }
}
