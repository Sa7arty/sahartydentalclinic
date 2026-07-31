import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import { AppSettings } from '../types'
import { useAuth } from './AuthContext'

interface SettingsContextValue {
  settings: AppSettings
  loading: boolean
  refresh: () => Promise<void>
}

const defaultSettings: AppSettings = {
  id_digit_length: 5,
  auto_generate_file_number: true,
  required_fields: [],
  week_start_day: 6,
  default_visit_duration_minutes: 60,
  elderly_age_threshold: 65,
  currency: 'EGP',
  default_country: 'Egypt',
  default_nationality: 'Egypt',
  profit_share_percent: 0,
  salary_period_start_day: 26,
  salary_pay_day: 28,
  leave_eligibility_months: 6,
  overtime_midnight_multiplier: 2,
  early_overtime_cap_hours: 1,
  salary_rounding: 10,
  weekly_off_day: 5,
  late_grace_minutes: 0,
  rows_per_page: 25,
  expense_category_required: false,
  expense_item_required: false,
  expense_description_required: true,
}

const SettingsContext = createContext<SettingsContextValue | undefined>(undefined)

export function SettingsProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth()
  const [settings, setSettings] = useState<AppSettings>(defaultSettings)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    const { data } = await supabase.from('app_settings').select('*').single()
    if (data) {
      setSettings({
        id_digit_length: data.id_digit_length,
        auto_generate_file_number: data.auto_generate_file_number,
        required_fields: data.required_fields ?? [],
        week_start_day: data.week_start_day,
        default_visit_duration_minutes: data.default_visit_duration_minutes,
        elderly_age_threshold: data.elderly_age_threshold,
        currency: data.currency ?? 'EGP',
        default_country: data.default_country,
        default_nationality: data.default_nationality,
        profit_share_percent: data.profit_share_percent ?? 0,
        salary_period_start_day: data.salary_period_start_day ?? 26,
        salary_pay_day: data.salary_pay_day ?? 28,
        leave_eligibility_months: data.leave_eligibility_months ?? 6,
        overtime_midnight_multiplier: data.overtime_midnight_multiplier ?? 2,
        early_overtime_cap_hours: data.early_overtime_cap_hours ?? 1,
        salary_rounding: data.salary_rounding ?? 10,
        weekly_off_day: data.weekly_off_day ?? 5,
        late_grace_minutes: data.late_grace_minutes ?? 0,
        rows_per_page: data.rows_per_page ?? 25,
        expense_category_required: data.expense_category_required ?? false,
        expense_item_required: data.expense_item_required ?? false,
        expense_description_required: data.expense_description_required ?? true,
      })
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    if (session) refresh()
    else setLoading(false)
  }, [session, refresh])

  return <SettingsContext.Provider value={{ settings, loading, refresh }}>{children}</SettingsContext.Provider>
}

export function useSettings() {
  const ctx = useContext(SettingsContext)
  if (!ctx) throw new Error('useSettings must be used within SettingsProvider')
  return ctx
}
