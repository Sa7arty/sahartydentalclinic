import jsPDF from 'jspdf'
import { LedgerEntry, Patient, PrescriptionItem, patientFullName } from '../types'

export function exportPrescriptionPdf(
  patient: Patient,
  prescriberName: string,
  items: PrescriptionItem[],
  notes: string,
  dateLabel: string,
) {
  const doc = new jsPDF()

  doc.setFontSize(16)
  doc.text('Saharty Dental Clinic', 14, 18)
  doc.setFontSize(12)
  doc.text('Prescription (Rx)', 14, 26)

  doc.setFontSize(10)
  doc.text(`Patient: ${patientFullName(patient)}`, 14, 40)
  doc.text(`File #: ${patient.file_number ?? '-'}`, 14, 46)
  doc.text(`Date: ${dateLabel}`, 140, 40)
  if (prescriberName) doc.text(`Prescriber: ${prescriberName}`, 140, 46)
  doc.line(14, 52, 196, 52)

  // Big Rx symbol
  doc.setFontSize(22)
  doc.setFont('helvetica', 'bold')
  doc.text('℞', 14, 66)
  doc.setFont('helvetica', 'normal')

  let y = 66
  doc.setFontSize(11)
  items.forEach((it, i) => {
    if (y > 250) {
      doc.addPage()
      y = 30
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
  doc.text('Signature: ____________________________', 130, 280)

  doc.save(`prescription-${patient.file_number ?? patient.id}-${dateLabel.replace(/\//g, '-')}.pdf`)
}

export function exportLedgerStatementPdf(patient: Patient, entries: LedgerEntry[]) {
  const doc = new jsPDF()
  const balance = entries.reduce((sum, l) => sum + (l.entry_type === 'charge' ? Number(l.amount) : -Number(l.amount)), 0)

  doc.setFontSize(16)
  doc.text('Saharty Dental Clinic', 14, 18)
  doc.setFontSize(11)
  doc.text('Patient Statement', 14, 26)

  doc.setFontSize(10)
  doc.text(`Patient: ${patientFullName(patient)}`, 14, 38)
  doc.text(`File #: ${patient.file_number ?? '-'}`, 14, 44)
  doc.text(`Phone: ${patient.phone ?? '-'}`, 14, 50)
  doc.text(`Printed: ${new Date().toLocaleString()}`, 14, 56)

  let y = 70
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
    if (y > 270) {
      doc.addPage()
      y = 20
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

export function exportPayslipPdf(d: PayslipPdfData) {
  const doc = new jsPDF()
  const money = (n: number) => `${d.currency} ${n.toFixed(2)}`

  doc.setFontSize(16)
  doc.text('Saharty Dental Clinic', 14, 18)
  doc.setFontSize(12)
  doc.text('Payslip', 14, 26)

  doc.setFontSize(10)
  doc.text(`Employee: ${d.employeeName}`, 14, 38)
  if (d.position) doc.text(`Position: ${d.position}`, 14, 44)
  doc.text(`Pay date: ${d.payDateLabel}`, 130, 38)
  doc.text(`Attendance period: ${d.periodLabel}`, 14, 52)
  doc.text(`Bonuses earned: ${d.bonusPeriodLabel}`, 14, 58)

  let y = 74
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

  doc.save(`payslip-${d.employeeName.replace(/\s+/g, '-')}-${d.payDateLabel.replace(/\//g, '-')}.pdf`)
}

export function exportOrderSummaryPdf(title: string, monthLabel: string, lines: { name: string; brand: string; qty: number }[]) {
  const doc = new jsPDF()
  doc.setFontSize(16)
  doc.text('Saharty Dental Clinic', 14, 18)
  doc.setFontSize(12)
  doc.text(`Order summary — ${title} — ${monthLabel}`, 14, 26)

  let y = 40
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
    if (y > 275) {
      doc.addPage()
      y = 20
    }
    doc.text(l.name.slice(0, 60), 14, y)
    doc.text((l.brand || '').slice(0, 30), 120, y)
    doc.text(String(l.qty), 185, y, { align: 'right' })
    y += 7
  }

  doc.save(`order-${title.replace(/\s+/g, '-')}-${monthLabel.replace(/\s+/g, '-')}.pdf`)
}

export function exportOutstandingBalancesPdf(
  currency: string,
  rows: { name: string; phone: string | null; lastActivity: string | null; balance: number }[],
) {
  const doc = new jsPDF()
  const total = rows.reduce((s, r) => s + r.balance, 0)

  doc.setFontSize(16)
  doc.text('Saharty Dental Clinic', 14, 18)
  doc.setFontSize(12)
  doc.text('Outstanding balances', 14, 26)
  doc.setFontSize(9)
  doc.text(`Printed: ${new Date().toLocaleString()}`, 14, 32)

  let y = 44
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
    if (y > 272) {
      doc.addPage()
      y = 20
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

  doc.save(`outstanding-balances-${new Date().toISOString().slice(0, 10)}.pdf`)
}

export function exportStaffSummaryPdf(
  monthLabel: string,
  currency: string,
  rows: { name: string; present: number; hours: number; overtime: number; late: number; paidLeave: number; absent: number; netPay: number }[],
) {
  const doc = new jsPDF()
  doc.setFontSize(16)
  doc.text('Saharty Dental Clinic', 14, 18)
  doc.setFontSize(12)
  doc.text(`Staff summary — ${monthLabel}`, 14, 26)

  let y = 42
  doc.setFontSize(9)
  const header = () => {
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
    if (y > 275) {
      doc.addPage()
      y = 20
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

  doc.save(`staff-summary-${monthLabel.replace(/\s+/g, '-')}.pdf`)
}

export function exportDaySchedulePdf(dateLabel: string, visits: { time: string; patientName: string; status: string }[]) {
  const doc = new jsPDF()
  doc.setFontSize(16)
  doc.text('Saharty Dental Clinic', 14, 18)
  doc.setFontSize(12)
  doc.text(`Schedule — ${dateLabel}`, 14, 26)

  let y = 42
  doc.setFontSize(10)
  if (visits.length === 0) {
    doc.text('No visits scheduled.', 14, y)
  }
  for (const v of visits) {
    if (y > 270) {
      doc.addPage()
      y = 20
    }
    doc.text(`${v.time}   ${v.patientName}   (${v.status})`, 14, y)
    y += 8
  }

  doc.save(`schedule-${dateLabel}.pdf`)
}
