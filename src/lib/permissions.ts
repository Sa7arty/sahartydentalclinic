export type PermissionAction = 'view' | 'edit' | 'delete'

export interface ResourceDef {
  key: string
  label: string
  actions: PermissionAction[]
}

/**
 * Every item the owner can grant/revoke per staff group in Settings → Security.
 * Deliberately scoped to what actually has a separate create/edit/delete
 * handler in the app today, not an invented ideal list — `actions` says which
 * of View/Edit/Delete actually apply, so e.g. payroll (no delete handler
 * exists — a finalized run is locked) only shows two checkboxes, not three.
 */
export const PERMISSION_RESOURCES: ResourceDef[] = [
  { key: 'patients', label: 'Patients', actions: ['view', 'edit', 'delete'] },
  { key: 'visits', label: 'Appointments / Schedule', actions: ['view', 'edit', 'delete'] },
  { key: 'clinical_notes', label: 'Clinical notes & treatment plans', actions: ['view', 'edit'] },
  { key: 'tooth_chart', label: 'Tooth chart', actions: ['view', 'edit'] },
  { key: 'prescriptions', label: 'Prescriptions', actions: ['view', 'edit', 'delete'] },
  { key: 'letters', label: 'Letters (referrals, reports, etc.)', actions: ['view', 'edit', 'delete'] },
  { key: 'documents', label: 'Documents & X-rays', actions: ['view', 'edit', 'delete'] },
  { key: 'patient_ledger', label: 'Patient billing (charges/payments)', actions: ['view', 'edit', 'delete'] },
  { key: 'clinic_finances', label: 'Clinic expenses & fees', actions: ['view', 'edit', 'delete'] },
  { key: 'misc_income', label: 'Misc income', actions: ['view', 'edit', 'delete'] },
  { key: 'employees', label: 'Employee records', actions: ['view', 'edit', 'delete'] },
  { key: 'employee_salary', label: 'Employee salary', actions: ['view', 'edit'] },
  { key: 'payroll', label: 'Payroll & payslips', actions: ['view', 'edit'] },
  { key: 'attendance', label: 'Staff attendance records', actions: ['view', 'edit', 'delete'] },
  { key: 'leave', label: 'Leave requests', actions: ['view', 'edit', 'delete'] },
  { key: 'deductions', label: 'Deductions & loans', actions: ['view', 'edit', 'delete'] },
  { key: 'providers', label: 'Providers (dentist roster)', actions: ['view', 'edit', 'delete'] },
  { key: 'staff_logins', label: 'Staff logins & roles', actions: ['view', 'edit', 'delete'] },
  { key: 'inventory', label: 'Inventory', actions: ['view', 'edit', 'delete'] },
  { key: 'settings_config', label: 'Clinic settings & reference lists', actions: ['view', 'edit'] },
]

export interface StaffGroup {
  id: string
  name: string
  created_at: string
}

export interface GroupPermission {
  group_id: string
  resource_key: string
  can_view: boolean
  can_edit: boolean
  can_delete: boolean
}
