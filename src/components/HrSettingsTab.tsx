import { FormEvent, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useSettings } from '../context/SettingsContext'

const card = 'space-y-3 rounded-xl border border-slate-200 bg-white p-4'
const input = 'w-full rounded-lg border border-slate-300 px-3 py-2'
const hint = 'mt-0.5 text-[11px] text-slate-400'
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

/**
 * HR → Settings: everything that configures the HR module lives here
 * (payroll rules, overtime, weekly day off, and the digital sign-in location).
 */
export default function HrSettingsTab() {
  const { settings, refresh } = useSettings()

  // Payroll & attendance rules
  const [profitSharePercent, setProfitSharePercent] = useState(settings.profit_share_percent)
  const [salaryPeriodStartDay, setSalaryPeriodStartDay] = useState(settings.salary_period_start_day)
  const [salaryPayDay, setSalaryPayDay] = useState(settings.salary_pay_day)
  const [leaveEligibilityMonths, setLeaveEligibilityMonths] = useState(settings.leave_eligibility_months)
  const [midnightMultiplier, setMidnightMultiplier] = useState(settings.overtime_midnight_multiplier)
  const [earlyOtCap, setEarlyOtCap] = useState(settings.early_overtime_cap_hours)
  const [salaryRounding, setSalaryRounding] = useState(settings.salary_rounding)
  const [weeklyOffDay, setWeeklyOffDay] = useState(settings.weekly_off_day)
  const [lateGraceMinutes, setLateGraceMinutes] = useState(settings.late_grace_minutes)
  const [savingPayroll, setSavingPayroll] = useState(false)

  // Digital sign in / sign out location
  const [clinicLat, setClinicLat] = useState(settings.clinic_latitude)
  const [clinicLng, setClinicLng] = useState(settings.clinic_longitude)
  const [attendanceRadius, setAttendanceRadius] = useState(settings.attendance_radius_meters)
  const [locating, setLocating] = useState(false)
  const [savingAttendance, setSavingAttendance] = useState(false)

  useEffect(() => {
    setProfitSharePercent(settings.profit_share_percent)
    setSalaryPeriodStartDay(settings.salary_period_start_day)
    setSalaryPayDay(settings.salary_pay_day)
    setLeaveEligibilityMonths(settings.leave_eligibility_months)
    setMidnightMultiplier(settings.overtime_midnight_multiplier)
    setEarlyOtCap(settings.early_overtime_cap_hours)
    setSalaryRounding(settings.salary_rounding)
    setWeeklyOffDay(settings.weekly_off_day)
    setLateGraceMinutes(settings.late_grace_minutes)
    setClinicLat(settings.clinic_latitude)
    setClinicLng(settings.clinic_longitude)
    setAttendanceRadius(settings.attendance_radius_meters)
  }, [settings])

  async function handleSavePayroll(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setSavingPayroll(true)
    const { error } = await supabase
      .from('app_settings')
      .update({
        profit_share_percent: profitSharePercent,
        salary_period_start_day: salaryPeriodStartDay,
        salary_pay_day: salaryPayDay,
        leave_eligibility_months: leaveEligibilityMonths,
        overtime_midnight_multiplier: midnightMultiplier,
        early_overtime_cap_hours: earlyOtCap,
        salary_rounding: salaryRounding,
        weekly_off_day: weeklyOffDay,
        late_grace_minutes: lateGraceMinutes,
      })
      .eq('id', true)
    setSavingPayroll(false)
    if (error) alert(error.message)
    else await refresh()
  }

  function handleUseMyLocation() {
    if (!navigator.geolocation) return alert("Your browser doesn't support location.")
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setClinicLat(pos.coords.latitude)
        setClinicLng(pos.coords.longitude)
        setLocating(false)
      },
      (err) => {
        setLocating(false)
        alert(err.code === 1 ? 'Location access was denied — allow it for this site in your browser settings and try again.' : "Couldn't get your location. Please try again.")
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    )
  }

  async function handleSaveAttendance(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setSavingAttendance(true)
    const { error } = await supabase
      .from('app_settings')
      .update({ clinic_latitude: clinicLat, clinic_longitude: clinicLng, attendance_radius_meters: attendanceRadius })
      .eq('id', true)
    setSavingAttendance(false)
    if (error) alert(error.message)
    else await refresh()
  }

  return (
    <div className="space-y-4">
      <form onSubmit={handleSavePayroll} className={card}>
        <div>
          <h2 className="font-medium text-navy-900">Payroll &amp; attendance rules</h2>
          <p className="text-sm text-slate-500">Used by the HR attendance, payroll and summary calculators.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className="mb-1 block text-sm text-slate-500">Profit-share to staff (%)</label>
            <input type="number" min="0" max="100" step="0.1" value={profitSharePercent} onChange={(e) => setProfitSharePercent(Number(e.target.value))} className={input} />
            <p className={hint}>Share of net profit split among active staff as a bonus, in proportion to the days each one worked.</p>
          </div>
          <div>
            <label className="mb-1 block text-sm text-slate-500">Salary period starts on day</label>
            <input type="number" min="1" max="28" value={salaryPeriodStartDay} onChange={(e) => setSalaryPeriodStartDay(Number(e.target.value))} className={input} />
            <p className={hint}>e.g. 26 → attendance runs 26th to 25th.</p>
          </div>
          <div>
            <label className="mb-1 block text-sm text-slate-500">Salary paid on day</label>
            <input type="number" min="1" max="28" value={salaryPayDay} onChange={(e) => setSalaryPayDay(Number(e.target.value))} className={input} />
          </div>
          <div>
            <label className="mb-1 block text-sm text-slate-500">No-leave period for new staff (months)</label>
            <input type="number" min="0" max="36" value={leaveEligibilityMonths} onChange={(e) => setLeaveEligibilityMonths(Number(e.target.value))} className={input} />
            <p className={hint}>Employees can't take leave for this many months after their first day.</p>
          </div>
          <div>
            <label className="mb-1 block text-sm text-slate-500">After-midnight overtime ×</label>
            <input type="number" min="1" step="0.1" value={midnightMultiplier} onChange={(e) => setMidnightMultiplier(Number(e.target.value))} className={input} />
            <p className={hint}>Overtime hours worked after 12 AM are paid at this multiple.</p>
          </div>
          <div>
            <label className="mb-1 block text-sm text-slate-500">Early-arrival overtime cap (hours)</label>
            <input type="number" min="0" step="0.5" value={earlyOtCap} onChange={(e) => setEarlyOtCap(Number(e.target.value))} className={input} />
            <p className={hint}>Max overtime credited for showing up before a fixed shift starts.</p>
          </div>
          <div>
            <label className="mb-1 block text-sm text-slate-500">Round net salary to nearest</label>
            <select value={salaryRounding} onChange={(e) => setSalaryRounding(Number(e.target.value))} className={input}>
              <option value={0}>No rounding</option>
              <option value={5}>5</option>
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
            <p className={hint}>Each employee's final total is rounded (categories stay exact).</p>
          </div>
          <div>
            <label className="mb-1 block text-sm text-slate-500">Weekly day off</label>
            <select value={weeklyOffDay} onChange={(e) => setWeeklyOffDay(Number(e.target.value))} className={input}>
              {WEEKDAYS.map((d, i) => (
                <option key={i} value={i}>
                  {d}
                </option>
              ))}
            </select>
            <p className={hint}>Working this day: every hour counts as overtime.</p>
          </div>
          <div>
            <label className="mb-1 block text-sm text-slate-500">Late after (minutes)</label>
            <input type="number" min="0" max="120" value={lateGraceMinutes} onChange={(e) => setLateGraceMinutes(Number(e.target.value))} className={input} />
            <p className={hint}>Grace period — a “Late” flag shows only after this many minutes past shift start.</p>
          </div>
        </div>
        <button type="submit" disabled={savingPayroll} className="rounded-lg bg-navy-900 px-4 py-2 text-sm font-medium text-white hover:bg-navy-800 disabled:opacity-50">
          {savingPayroll ? 'Saving…' : 'Save'}
        </button>
      </form>

      <form onSubmit={handleSaveAttendance} className={card}>
        <div>
          <h2 className="font-medium text-navy-900">Digital sign in / sign out</h2>
          <p className="text-sm text-slate-500">
            Staff with a login (see Team &amp; access, or "Create a login" on an employee in the Team tab) get Sign In / Sign Out buttons on their Dashboard. They can only be used from within the radius
            below of the clinic's exact coordinates — the browser asks the staff member to share their location the first time they try.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className="mb-1 block text-sm text-slate-500">Clinic latitude</label>
            <input type="number" step="any" value={clinicLat ?? ''} onChange={(e) => setClinicLat(e.target.value === '' ? null : Number(e.target.value))} placeholder="e.g. 31.2001" className={input} />
          </div>
          <div>
            <label className="mb-1 block text-sm text-slate-500">Clinic longitude</label>
            <input type="number" step="any" value={clinicLng ?? ''} onChange={(e) => setClinicLng(e.target.value === '' ? null : Number(e.target.value))} placeholder="e.g. 29.9187" className={input} />
          </div>
          <div>
            <label className="mb-1 block text-sm text-slate-500">Allowed radius (meters)</label>
            <input type="number" min="10" step="10" value={attendanceRadius} onChange={(e) => setAttendanceRadius(Number(e.target.value))} className={input} />
            <p className={hint}>Phone GPS drifts indoors — 100m is a safe default.</p>
          </div>
        </div>

        <div>
          <button
            type="button"
            onClick={handleUseMyLocation}
            disabled={locating}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-navy-800 hover:bg-slate-50 disabled:opacity-50"
          >
            {locating ? 'Getting your location…' : '📍 Use my current location'}
          </button>
          <p className="mt-1 text-[11px] text-slate-400">Stand inside the clinic and tap this to fill in the coordinates precisely, instead of typing them.</p>
        </div>

        <button type="submit" disabled={savingAttendance} className="rounded-lg bg-navy-900 px-4 py-2 text-sm font-medium text-white hover:bg-navy-800 disabled:opacity-50">
          {savingAttendance ? 'Saving…' : 'Save'}
        </button>
      </form>
    </div>
  )
}
