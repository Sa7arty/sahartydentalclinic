export function toYmd(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function fromYmd(ymd: string): Date {
  return new Date(`${ymd}T00:00:00`)
}

export function addDays(ymd: string, n: number): string {
  const d = fromYmd(ymd)
  d.setDate(d.getDate() + n)
  return toYmd(d)
}

export function addMonths(ymd: string, n: number): string {
  const d = fromYmd(ymd)
  d.setMonth(d.getMonth() + n)
  return toYmd(d)
}

/** First day of the week containing this date. weekStartDay: 0=Sunday .. 6=Saturday. */
export function startOfWeek(ymd: string, weekStartDay = 0): string {
  const d = fromYmd(ymd)
  const diff = (d.getDay() - weekStartDay + 7) % 7
  d.setDate(d.getDate() - diff)
  return toYmd(d)
}

export const WEEKDAY_NAMES_FROM = (weekStartDay: number): string[] => {
  const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  return Array.from({ length: 7 }, (_, i) => names[(weekStartDay + i) % 7])
}

export function startOfMonth(ymd: string): string {
  const d = fromYmd(ymd)
  return toYmd(new Date(d.getFullYear(), d.getMonth(), 1))
}

export function endOfMonth(ymd: string): string {
  const d = fromYmd(ymd)
  return toYmd(new Date(d.getFullYear(), d.getMonth() + 1, 0))
}

export function dayStart(ymd: string): Date {
  return new Date(`${ymd}T00:00:00`)
}

export function dayEnd(ymd: string): Date {
  return new Date(`${ymd}T23:59:59.999`)
}

// ---- Consistent dd/mm/yyyy display formatting across the whole app ----

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

/** Accepts a Date, an ISO timestamp, or a 'yyyy-mm-dd' string. Returns dd/mm/yyyy (or '' if invalid). */
export function formatDate(input: string | Date | null | undefined): string {
  if (!input) return ''
  const d = typeof input === 'string' ? (input.length === 10 ? fromYmd(input) : new Date(input)) : input
  if (Number.isNaN(d.getTime())) return ''
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`
}

/** Convert an ISO timestamp to the value an <input type="datetime-local"> expects (local time). */
export function toDatetimeLocal(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso
  if (Number.isNaN(d.getTime())) return ''
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** dd/mm/yyyy HH:mm from a Date or ISO timestamp. */
export function formatDateTime(input: string | Date | null | undefined): string {
  if (!input) return ''
  const d = typeof input === 'string' ? new Date(input) : input
  if (Number.isNaN(d.getTime())) return ''
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}
