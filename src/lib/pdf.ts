import jsPDF from 'jspdf'
import { LedgerEntry, Patient, PrescriptionItem, patientFullName, PaymentMethod, PAYMENT_METHOD_LABELS } from '../types'

// ---------------------------------------------------------------------------
// Shared letterhead — every PDF the clinic exports (receipts, prescriptions,
// letters, payslips, inventory/staff reports, schedules…) uses the same logo
// header and contact-info footer, matching the clinic's official letterhead.
// ---------------------------------------------------------------------------

const NAVY: [number, number, number] = [15, 23, 42]
const GOLD: [number, number, number] = [180, 138, 66]
const GRAY: [number, number, number] = [100, 116, 139]

let logoDataUrlPromise: Promise<string | null> | null = null

/** Fetches the clinic's letterhead logo once per session and caches it as a data URL. */
function getLogoDataUrl(): Promise<string | null> {
  if (!logoDataUrlPromise) {
    logoDataUrlPromise = fetch('/logo-letterhead.png')
      .then((res) => res.blob())
      .then(
        (blob) =>
          new Promise<string | null>((resolve) => {
            const reader = new FileReader()
            reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null)
            reader.onerror = () => resolve(null)
            reader.readAsDataURL(blob)
          }),
      )
      .catch(() => null)
  }
  return logoDataUrlPromise
}

/** Draws the logo + clinic name + document subtitle at the top of the current page. Returns the y (mm) where body content should start. */
async function drawLetterheadHeader(doc: jsPDF, subtitle: string): Promise<number> {
  const pageWidth = doc.internal.pageSize.getWidth()
  const logo = await getLogoDataUrl()
  const textX = logo ? 38 : 14
  if (logo) {
    try {
      doc.addImage(logo, 'PNG', 14, 8, 20, 20)
    } catch {
      // Corrupt/unavailable image data — fall back to text-only header.
    }
  }
  doc.setTextColor(...NAVY)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(15)
  doc.text('SAHARTY DENTAL CLINIC', textX, 17)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(11)
  doc.setTextColor(...GOLD)
  doc.text(subtitle, textX, 24)
  doc.setDrawColor(...GOLD)
  doc.setLineWidth(0.6)
  doc.line(14, 32, pageWidth - 14, 32)
  doc.setTextColor(0, 0, 0)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  return 42
}

/** Draws the clinic's contact-info bar at the bottom of the current page. */
function drawLetterheadFooter(doc: jsPDF) {
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const y = pageHeight - 16
  doc.setDrawColor(...GOLD)
  doc.setLineWidth(0.4)
  doc.line(14, y, pageWidth - 14, y)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(...GRAY)
  doc.text('Tel: (+2) 010 1515 1111  /  (+2) 02 3336 2222    Email: saharty@gmail.com', pageWidth / 2, y + 5, { align: 'center' })
  doc.text('43 Kambiz St., Mosadak, Dokki — in front of Shooting Club Gate 10    www.sahartydentalclinic.com', pageWidth / 2, y + 9.5, {
    align: 'center',
  })
  doc.setTextColor(0, 0, 0)
}

/** Stamps the footer on every page of the document — call once, right before doc.save(). */
function finalizeLetterhead(doc: jsPDF) {
  const pages = doc.getNumberOfPages()
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i)
    drawLetterheadFooter(doc)
  }
}

/** y (mm) to start content on a page AFTER the first (no logo header repeated). */
const CONTINUATION_Y = 20
/** Content must not run past this y (mm) on an A4 page — leaves room for the footer. */
const PAGE_BREAK_Y = 263

export async function exportPaymentReceiptPdf(
  patient: Pick<Patient, 'first_name' | 'middle_name' | 'last_name' | 'file_number'>,
  entry: { amount: number; occurred_at: string; payment_method: PaymentMethod | null; description?: string | null },
  currency: string,
) {
  const doc = new jsPDF()
  const receiptNo = new Date(entry.occurred_at).getTime().toString().slice(-8)
  let y = await drawLetterheadHeader(doc, 'Payment Receipt')

  doc.setFontSize(9)
  doc.text(`Receipt #${receiptNo}`, 196, y, { align: 'right' })
  doc.text(`Printed: ${new Date().toLocaleString()}`, 196, y + 5, { align: 'right' })

  doc.setFontSize(10)
  doc.text(`Patient: ${patientFullName(patient)}`, 14, y + 8)
  if (patient.file_number) doc.text(`File #: ${patient.file_number}`, 14, y + 14)
  doc.text(`Date received: ${new Date(entry.occurred_at).toLocaleString()}`, 14, y + 20)
  doc.line(14, y + 26, 196, y + 26)

  y += 38
  doc.setFontSize(11)
  doc.text('Received with thanks:', 14, y)
  y += 12
  doc.setFontSize(20)
  doc.setFont('helvetica', 'bold')
  doc.text(`${currency} ${Number(entry.amount).toFixed(2)}`, 14, y)
  doc.setFont('helvetica', 'normal')
  y += 10
  doc.setFontSize(11)
  doc.text(`Payment method: ${entry.payment_method ? PAYMENT_METHOD_LABELS[entry.payment_method] : 'Not specified'}`, 14, y)
  if (entry.description) {
    y += 8
    doc.text(doc.splitTextToSize(`Note: ${entry.description}`, 180), 14, y)
  }

  doc.setFontSize(9)
  doc.text('Thank you for your payment.', 14, 240)
  doc.text('Signature: ____________________________', 120, 248)

  finalizeLetterhead(doc)
  doc.save(`receipt-${receiptNo}-${(patient.file_number ?? patientFullName(patient)).replace(/\s+/g, '-')}.pdf`)
}

export async function exportPrescriptionPdf(patient: Patient, prescriberName: string, items: PrescriptionItem[], notes: string, dateLabel: string) {
  const doc = new jsPDF()
  let y = await drawLetterheadHeader(doc, 'Prescription (Rx)')

  doc.setFontSize(10)
  doc.text(`Patient: ${patientFullName(patient)}`, 14, y + 6)
  doc.text(`File #: ${patient.file_number ?? '-'}`, 14, y + 12)
  doc.text(`Date: ${dateLabel}`, 140, y + 6)
  if (prescriberName) doc.text(`Prescriber: ${prescriberName}`, 140, y + 12)
  doc.line(14, y + 18, 196, y + 18)

  y += 32
  doc.setFontSize(22)
  doc.setFont('helvetica', 'bold')
  doc.text('℞', 14, y)
  doc.setFont('helvetica', 'normal')

  doc.setFontSize(11)
  items.forEach((it, i) => {
    if (y > PAGE_BREAK_Y) {
      doc.addPage()
      y = CONTINUATION_Y
    }
    doc.setFont('helvetica', 'bold')
    const dose = [it.dosage, it.frequency, it.duration].filter(Boolean).join(' · ')
    doc.text(`${i + 1}. ${it.drug}${dose ? `  —  ${dose}` : ''}`, 28, y)
    y += 6
    if (it.instructions) {
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(10)
      doc.text(doc.splitTextToSize(it.instructions, 160), 28, y)
      y += 6 * Math.max(1, doc.splitTextToSize(it.instructions, 160).length)
      doc.setFontSize(11)
    }
    y += 3
  })

  if (notes) {
    y += 4
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.text('Notes:', 14, y)
    doc.setFont('helvetica', 'normal')
    y += 6
    doc.text(doc.splitTextToSize(notes, 180), 14, y)
    y += 6 * doc.splitTextToSize(notes, 180).length
  }

  doc.setFontSize(10)
  doc.text('Signature: ____________________________', 130, 248)

  finalizeLetterhead(doc)
  doc.save(`prescription-${patient.file_number ?? patient.id}-${dateLabel.replace(/\//g, '-')}.pdf`)
}

/** A generic formal clinic letter — referrals, medical reports, sick leave, cost confirmations, etc. Shares the same letterhead as every other export. */
export async function exportLetterPdf(
  title: string,
  patient: Pick<Patient, 'first_name' | 'middle_name' | 'last_name' | 'file_number'>,
  dateLabel: string,
  bodyParagraphs: string[],
  authorName: string,
) {
  const doc = new jsPDF()
  let y = await drawLetterheadHeader(doc, title)

  doc.setFontSize(10)
  doc.text(`Date: ${dateLabel}`, 196, y, { align: 'right' })
  doc.text(`Re: ${patientFullName(patient)}${patient.file_number ? ` (File #${patient.file_number})` : ''}`, 14, y)
  y += 10
  doc.line(14, y, 196, y)
  y += 12

  doc.setFontSize(11)
  for (const para of bodyParagraphs) {
    if (!para) {
      y += 5
      continue
    }
    const lines = doc.splitTextToSize(para, 182)
    for (const line of lines) {
      if (y > PAGE_BREAK_Y) {
        doc.addPage()
        y = CONTINUATION_Y
      }
      doc.text(line, 14, y)
      y += 6
    }
    y += 3
  }

  y += 10
  if (y > PAGE_BREAK_Y - 24) {
    doc.addPage()
    y = CONTINUATION_Y
  }
  doc.text('Sincerely,', 14, y)
  y += 14
  doc.setFont('helvetica', 'bold')
  doc.text(authorName || 'Saharty Dental Clinic', 14, y)
  doc.setFont('helvetica', 'normal')
  y += 5
  doc.setFontSize(9)
  doc.text('Saharty Dental Clinic', 14, y)

  finalizeLetterhead(doc)
  doc.save(`letter-${title.replace(/\s+/g, '-').toLowerCase()}-${(patient.file_number ?? patientFullName(patient)).replace(/\s+/g, '-')}.pdf`)
}

export async function exportLedgerStatementPdf(patient: Patient, entries: LedgerEntry[]) {
  const doc = new jsPDF()
  const balance = entries.reduce((sum, l) => sum + (l.entry_type === 'charge' ? Number(l.amount) : -Number(l.amount)), 0)
  let y = await drawLetterheadHeader(doc, 'Patient Statement')

  doc.setFontSize(10)
  doc.text(`Patient: ${patientFullName(patient)}`, 14, y + 4)
  doc.text(`File #: ${patient.file_number ?? '-'}`, 14, y + 10)
  doc.text(`Phone: ${patient.phone ?? '-'}`, 14, y + 16)
  doc.text(`Printed: ${new Date().toLocaleString()}`, 14, y + 22)

  y += 36
  doc.setFontSize(10)
  doc.setFont('helvetica', 'bold')
  doc.text('Date', 14, y)
  doc.text('Description', 44, y)
  doc.text('Type', 140, y)
  doc.text('Amount (EGP)', 165, y)
  doc.setFont('helvetica', 'normal')
  y += 4
  doc.line(14, y, 196, y)
  y += 6

  for (const entry of entries) {
    if (y > PAGE_BREAK_Y) {
      doc.addPage()
      y = CONTINUATION_Y
    }
    doc.text(new Date(entry.occurred_at).toLocaleDateString(), 14, y)
    doc.text((entry.description || (entry.entry_type === 'charge' ? 'Charge' : 'Payment')).slice(0, 45), 44, y)
    doc.text(entry.entry_type, 140, y)
    doc.text(`${entry.entry_type === 'charge' ? '+' : '-'}${Number(entry.amount).toFixed(2)}`, 165, y)
    y += 7
  }

  y += 6
  doc.line(14, y, 196, y)
  y += 8
  doc.setFontSize(12)
  doc.setFont('helvetica', 'bold')
  doc.text(`Outstanding balance: EGP ${balance.toFixed(2)}`, 14, y)

  finalizeLetterhead(doc)
  doc.save(`statement-${patient.file_number ?? patient.id}.pdf`)
}

export interface PayslipPdfData {
  employeeName: string
  position: string | null
  currency: string
  periodLabel: string
  bonusPeriodLabel: string
  payDateLabel: string
  baseSalary: number
  perDayValue: number
  expectedDays: number
  attendedDays: number
  paidLeaveDays: number
  unpaidDays: number
  regularPay: number
  overtimeHours: number
  overtimeRate: number
  overtimePay: number
  profitShare: number
  deductionsTotal?: number
  roundingAdj?: number
  total: number
}

export async function exportPayslipPdf(d: PayslipPdfData) {
  const doc = new jsPDF()
  const money = (n: number) => `${d.currency} ${n.toFixed(2)}`
  let y = await drawLetterheadHeader(doc, 'Payslip')

  doc.setFontSize(10)
  doc.text(`Employee: ${d.employeeName}`, 14, y + 4)
  if (d.position) doc.text(`Position: ${d.position}`, 14, y + 10)
  doc.text(`Pay date: ${d.payDateLabel}`, 130, y + 4)
  doc.text(`Attendance period: ${d.periodLabel}`, 14, y + 16)
  doc.text(`Bonuses earned: ${d.bonusPeriodLabel}`, 14, y + 22)

  y += 38
  const row = (label: string, value: string, bold = false) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal')
    doc.text(label, 14, y)
    doc.text(value, 196, y, { align: 'right' })
    y += 7
  }

  doc.setFont('helvetica', 'bold')
  doc.text('Earnings', 14, y)
  y += 4
  doc.line(14, y, 196, y)
  y += 8
  doc.setFont('helvetica', 'normal')

  row('Monthly base salary', money(d.baseSalary))
  row(`Value of one day (base ÷ ${d.expectedDays} expected days)`, money(d.perDayValue))
  row(`Days paid (${d.attendedDays} attended + ${d.paidLeaveDays} paid leave)`, `${Math.min(d.attendedDays + d.paidLeaveDays, d.expectedDays)} / ${d.expectedDays}`)
  row('Base pay (pro-rated by attendance)', money(d.regularPay))
  if (d.unpaidDays > 0) row(`Unpaid absence / over-allowance (${d.unpaidDays} day[s])`, `- ${money(d.unpaidDays * d.perDayValue)}`)
  row(`Overtime (${d.overtimeHours.toFixed(1)} hrs)`, money(d.overtimePay))
  row('Profit-share bonus', money(d.profitShare))
  if (d.deductionsTotal && d.deductionsTotal > 0) row('Deductions / loan installments', `- ${money(d.deductionsTotal)}`)
  if (d.roundingAdj && Math.abs(d.roundingAdj) >= 0.005) row('Rounding', `${d.roundingAdj > 0 ? '+' : '-'} ${money(Math.abs(d.roundingAdj))}`)

  y += 2
  doc.line(14, y, 196, y)
  y += 8
  doc.setFontSize(12)
  row('Net pay', money(d.total), true)

  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  doc.text('Base pay reflects attendance and paid leave. Overtime and profit-share are earned in the previous period and paid this month.', 14, y + 6)

  finalizeLetterhead(doc)
  doc.save(`payslip-${d.employeeName.replace(/\s+/g, '-')}-${d.payDateLabel.replace(/\//g, '-')}.pdf`)
}

export async function exportOrderSummaryPdf(title: string, monthLabel: string, lines: { name: string; brand: string; qty: number }[]) {
  const doc = new jsPDF()
  let y = await drawLetterheadHeader(doc, `Order Summary — ${title} — ${monthLabel}`)

  y += 8
  doc.setFontSize(10)
  doc.setFont('helvetica', 'bold')
  doc.text('Item', 14, y)
  doc.text('Brand', 120, y)
  doc.text('Qty', 185, y, { align: 'right' })
  doc.setFont('helvetica', 'normal')
  y += 4
  doc.line(14, y, 196, y)
  y += 6

  if (lines.length === 0) doc.text('Nothing to order — everything is stocked.', 14, y)
  for (const l of lines) {
    if (y > PAGE_BREAK_Y) {
      doc.addPage()
      y = CONTINUATION_Y
    }
    doc.text(l.name.slice(0, 60), 14, y)
    doc.text((l.brand || '').slice(0, 30), 120, y)
    doc.text(String(l.qty), 185, y, { align: 'right' })
    y += 7
  }

  finalizeLetterhead(doc)
  doc.save(`order-${title.replace(/\s+/g, '-')}-${monthLabel.replace(/\s+/g, '-')}.pdf`)
}

export async function exportOutstandingBalancesPdf(
  currency: string,
  rows: { name: string; phone: string | null; lastActivity: string | null; balance: number }[],
) {
  const doc = new jsPDF()
  const total = rows.reduce((s, r) => s + r.balance, 0)
  let y = await drawLetterheadHeader(doc, 'Outstanding Balances')

  doc.setFontSize(9)
  doc.text(`Printed: ${new Date().toLocaleString()}`, 14, y)

  y += 12
  doc.setFontSize(10)
  doc.setFont('helvetica', 'bold')
  doc.text('Patient', 14, y)
  doc.text('Phone', 90, y)
  doc.text('Last activity', 132, y)
  doc.text(`Owes (${currency})`, 196, y, { align: 'right' })
  doc.setFont('helvetica', 'normal')
  y += 4
  doc.line(14, y, 196, y)
  y += 6

  if (rows.length === 0) doc.text('No patient currently owes a balance.', 14, y)
  for (const r of rows) {
    if (y > PAGE_BREAK_Y) {
      doc.addPage()
      y = CONTINUATION_Y
    }
    doc.text(r.name.slice(0, 42), 14, y)
    doc.text((r.phone || '—').slice(0, 20), 90, y)
    doc.text(r.lastActivity || '—', 132, y)
    doc.text(r.balance.toFixed(2), 196, y, { align: 'right' })
    y += 7
  }

  y += 2
  doc.line(14, y, 196, y)
  y += 8
  doc.setFontSize(12)
  doc.setFont('helvetica', 'bold')
  doc.text(`Total outstanding: ${currency} ${total.toFixed(2)}`, 14, y)
  doc.text(`${rows.length} patient(s)`, 196, y, { align: 'right' })

  finalizeLetterhead(doc)
  doc.save(`outstanding-balances-${new Date().toISOString().slice(0, 10)}.pdf`)
}

export async function exportStaffSummaryPdf(
  monthLabel: string,
  currency: string,
  rows: { name: string; present: number; hours: number; overtime: number; late: number; paidLeave: number; absent: number; netPay: number }[],
) {
  const doc = new jsPDF()
  let y = await drawLetterheadHeader(doc, `Staff Summary — ${monthLabel}`)
  y += 6

  const header = () => {
    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')
    doc.text('Employee', 14, y)
    doc.text('Present', 78, y, { align: 'right' })
    doc.text('Hours', 98, y, { align: 'right' })
    doc.text('OT', 114, y, { align: 'right' })
    doc.text('Late', 130, y, { align: 'right' })
    doc.text('Leave', 148, y, { align: 'right' })
    doc.text('Absent', 168, y, { align: 'right' })
    doc.text(`Net (${currency})`, 196, y, { align: 'right' })
    doc.setFont('helvetica', 'normal')
    y += 4
    doc.line(14, y, 196, y)
    y += 6
  }
  header()

  if (rows.length === 0) doc.text('No active staff.', 14, y)
  for (const r of rows) {
    if (y > PAGE_BREAK_Y) {
      doc.addPage()
      y = CONTINUATION_Y
      header()
    }
    doc.text(r.name.slice(0, 32), 14, y)
    doc.text(String(r.present), 78, y, { align: 'right' })
    doc.text(r.hours.toFixed(1), 98, y, { align: 'right' })
    doc.text(r.overtime.toFixed(1), 114, y, { align: 'right' })
    doc.text(String(r.late), 130, y, { align: 'right' })
    doc.text(String(r.paidLeave), 148, y, { align: 'right' })
    doc.text(String(r.absent), 168, y, { align: 'right' })
    doc.text(r.netPay.toFixed(2), 196, y, { align: 'right' })
    y += 7
  }

  const totalNet = rows.reduce((s, r) => s + r.netPay, 0)
  y += 2
  doc.line(14, y, 196, y)
  y += 8
  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.text('Total payroll', 14, y)
  doc.text(`${currency} ${totalNet.toFixed(2)}`, 196, y, { align: 'right' })

  finalizeLetterhead(doc)
  doc.save(`staff-summary-${monthLabel.replace(/\s+/g, '-')}.pdf`)
}

export interface HuddleSheetRow {
  time: string
  patientName: string
  fileNumber: string | null
  provider: string
  status: string
  balance: number
  alerts: string
}

export async function exportDailyHuddleSheetPdf(dateLabel: string, currency: string, rows: HuddleSheetRow[]) {
  const doc = new jsPDF()
  let y = await drawLetterheadHeader(doc, `Daily Huddle Sheet — ${dateLabel}`)
  doc.setFontSize(9)
  doc.text(`Printed: ${new Date().toLocaleString()}`, 14, y)
  y += 12

  const header = () => {
    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')
    doc.text('Time', 14, y)
    doc.text('Patient', 36, y)
    doc.text('Provider', 100, y)
    doc.text('Status', 138, y)
    doc.text(`Balance (${currency})`, 196, y, { align: 'right' })
    doc.setFont('helvetica', 'normal')
    y += 4
    doc.line(14, y, 196, y)
    y += 6
  }
  header()

  if (rows.length === 0) doc.text('Nothing scheduled today.', 14, y)
  for (const r of rows) {
    if (y > PAGE_BREAK_Y) {
      doc.addPage()
      y = CONTINUATION_Y
      header()
    }
    doc.setFontSize(9)
    doc.text(r.time, 14, y)
    doc.text(`${r.patientName}${r.fileNumber ? ` (#${r.fileNumber})` : ''}`.slice(0, 42), 36, y)
    doc.text(r.provider.slice(0, 22), 100, y)
    doc.text(r.status, 138, y)
    doc.text(r.balance.toFixed(2), 196, y, { align: 'right' })
    y += 6
    if (r.alerts) {
      doc.setFontSize(8)
      doc.setTextColor(180, 40, 40)
      doc.text(`⚠ ${r.alerts}`.slice(0, 100), 36, y)
      doc.setTextColor(0, 0, 0)
      y += 5
    }
    y += 2
  }

  finalizeLetterhead(doc)
  doc.save(`huddle-sheet-${dateLabel.replace(/\//g, '-')}.pdf`)
}

export async function exportDaySchedulePdf(dateLabel: string, visits: { time: string; patientName: string; status: string }[]) {
  const doc = new jsPDF()
  let y = await drawLetterheadHeader(doc, `Schedule — ${dateLabel}`)
  y += 8

  doc.setFontSize(10)
  if (visits.length === 0) {
    doc.text('No visits scheduled.', 14, y)
  }
  for (const v of visits) {
    if (y > PAGE_BREAK_Y) {
      doc.addPage()
      y = CONTINUATION_Y
    }
    doc.text(`${v.time}   ${v.patientName}   (${v.status})`, 14, y)
    y += 8
  }

  finalizeLetterhead(doc)
  doc.save(`schedule-${dateLabel}.pdf`)
}
