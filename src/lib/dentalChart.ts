import { ChartScope, ToothSurface } from '../types'

// FDI two-digit notation, arranged left-to-right as viewed on a chart (patient's right on the left).
export const UPPER_ROW = [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28]
export const LOWER_ROW = [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38]
export const ALL_TEETH = [...UPPER_ROW, ...LOWER_ROW]

// Anterior teeth (incisors/canines) show an incisal edge instead of an occlusal table —
// same "O" surface code, just labeled differently in the UI.
const ANTERIOR = new Set([13, 12, 11, 21, 22, 23, 43, 42, 41, 31, 32, 33])
export function isAnterior(tooth: number) {
  return ANTERIOR.has(tooth)
}

// Standard WHO/periodontal 6-sextant grouping.
export const SEXTANTS: { key: string; label: string; teeth: number[] }[] = [
  { key: 'ur_post', label: 'Upper right (18–14)', teeth: [18, 17, 16, 15, 14] },
  { key: 'up_ant', label: 'Upper anterior (13–23)', teeth: [13, 12, 11, 21, 22, 23] },
  { key: 'ul_post', label: 'Upper left (24–28)', teeth: [24, 25, 26, 27, 28] },
  { key: 'll_post', label: 'Lower left (38–34)', teeth: [38, 37, 36, 35, 34] },
  { key: 'lo_ant', label: 'Lower anterior (33–43)', teeth: [33, 32, 31, 41, 42, 43] },
  { key: 'lr_post', label: 'Lower right (44–48)', teeth: [44, 45, 46, 47, 48] },
]

export const ARCHES: { key: 'upper' | 'lower'; label: string; teeth: number[] }[] = [
  { key: 'upper', label: 'Upper arch', teeth: UPPER_ROW },
  { key: 'lower', label: 'Lower arch', teeth: LOWER_ROW },
]

/** Turns a chosen scope + its selection (specific teeth/surfaces/sextant key/arch key) into the concrete tooth list to store. */
export function expandScopeToTeeth(scope: ChartScope, selection: { teeth?: number[]; sextantKey?: string; archKey?: 'upper' | 'lower' }): number[] {
  switch (scope) {
    case 'surface':
    case 'multi_surface':
    case 'whole_tooth':
      return selection.teeth ?? []
    case 'sextant':
      return SEXTANTS.find((s) => s.key === selection.sextantKey)?.teeth ?? []
    case 'arch':
      return ARCHES.find((a) => a.key === selection.archKey)?.teeth ?? []
    case 'whole_mouth':
      return ALL_TEETH
    default:
      return []
  }
}

/** Human-readable description of what a chart entry covers, for lists/tooltips. */
export function describeScope(scope: ChartScope, teeth: number[], surfaces: ToothSurface[]): string {
  switch (scope) {
    case 'surface':
    case 'multi_surface':
      return `Tooth ${teeth[0] ?? '?'} — ${surfaces.join(', ')}`
    case 'whole_tooth':
      return teeth.length === 1 ? `Tooth ${teeth[0]}` : `Teeth ${teeth.join(', ')}`
    case 'sextant': {
      const s = SEXTANTS.find((x) => x.teeth.length === teeth.length && x.teeth.every((t) => teeth.includes(t)))
      return s ? s.label : `Sextant (${teeth.join(', ')})`
    }
    case 'arch': {
      const a = ARCHES.find((x) => x.teeth.length === teeth.length && x.teeth.every((t) => teeth.includes(t)))
      return a ? a.label : `Arch (${teeth.length} teeth)`
    }
    case 'whole_mouth':
      return 'Whole mouth'
    default:
      return ''
  }
}
