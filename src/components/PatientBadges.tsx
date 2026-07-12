import { Patient, hasMedicalCondition, isElderly } from '../types'

/** The subset of patient fields the badges need — works for both full Patient rows and lightweight embeds. */
export type BadgePatient = Pick<Patient, 'id' | 'date_of_birth' | 'is_smoker'> & {
  medical_history?: string | null
  group?: { name: string } | null
}

/**
 * Small status badges shown next to a patient's name (Medical / Senior / Group / Smoker).
 * `hasCondition` lets callers pass structured-condition detection (from patient_conditions)
 * in addition to the free-text medical_history flag.
 */
export default function PatientBadges({
  patient,
  elderlyAgeThreshold,
  hasCondition = false,
  size = 'sm',
}: {
  patient: BadgePatient
  elderlyAgeThreshold: number
  hasCondition?: boolean
  size?: 'sm' | 'xs'
}) {
  const pill = size === 'xs' ? 'px-1 py-0 text-[9px]' : 'px-1.5 py-0.5 text-[10px]'
  const medical = hasCondition || hasMedicalCondition({ medical_history: patient.medical_history ?? null })
  const senior = isElderly({ date_of_birth: patient.date_of_birth }, elderlyAgeThreshold)
  return (
    <>
      {medical && (
        <span title="Has medical condition(s)" className={`rounded-full bg-red-100 font-semibold text-red-700 ${pill}`}>
          Medical
        </span>
      )}
      {senior && (
        <span title={`${elderlyAgeThreshold}+ years old`} className={`rounded-full bg-amber-100 font-semibold text-amber-700 ${pill}`}>
          Senior
        </span>
      )}
      {patient.group?.name && (
        <span className={`rounded-full bg-navy-100 font-semibold text-navy-700 ${pill}`}>{patient.group.name}</span>
      )}
      {patient.is_smoker && (
        <span title="Smoker" className="text-sm leading-none">
          🚬
        </span>
      )}
    </>
  )
}
