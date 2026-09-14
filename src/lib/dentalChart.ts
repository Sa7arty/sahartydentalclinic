import { ChartScope, ToothSurface, PaintType } from '../types'

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

// ---------------------------------------------------------------------------
// Anatomical tooth icon shapes. FDI's last digit tells the tooth type the same
// way in every quadrant (1-2 = incisor, 3 = canine, 4-5 = premolar, 6-8 = molar),
// so one shape set covers all 32 positions. Each path is drawn canonically as a
// LOWER tooth (root pointing down, incisal/occlusal edge up) — the chart flips
// upper-row teeth vertically to reuse the same paths, same trick as before.
// ---------------------------------------------------------------------------
export type ToothType = 'incisor' | 'canine' | 'premolar' | 'molar'

export function toothType(n: number): ToothType {
  const last = n % 10
  if (last === 1 || last === 2) return 'incisor'
  if (last === 3) return 'canine'
  if (last === 4 || last === 5) return 'premolar'
  return 'molar'
}

export const CROWN_W = 40
export const CROWN_H = 34
export const ROOT_H = 24

export const CROWN_PATHS: Record<ToothType, string> = {
  incisor: 'M13,2 L27,2 Q30,2 30,6 L29,28 Q28,34 24,34 L16,34 Q12,34 11,28 L10,6 Q10,2 13,2 Z',
  canine: 'M20,1 L29,9 Q31,12 30,18 L29,28 Q28,34 23,34 L17,34 Q12,34 11,28 L10,18 Q9,12 11,9 Z',
  premolar: 'M11,10 Q11,3 17,3 Q19,5 20,5 Q21,5 23,3 Q29,3 29,10 L29,28 Q28,34 23,34 L17,34 Q12,34 11,28 Z',
  molar: 'M8,10 Q8,3 14,3 Q17,6 19,4 Q21,3 23,4 Q25,6 26,3 Q32,3 32,10 L32,28 Q31,34 25,34 L15,34 Q9,34 8,28 Z',
}

// Roots are purely decorative (not clickable) — a single rounded bulb for most
// teeth, two narrower ones for molars, drawn below the crown in the same
// 0–40 wide box. Bulbous rather than sharply tapered, closer to how a real
// dental chart draws them.
export const ROOT_PATHS: Record<ToothType, string[]> = {
  incisor: ['M15,34 Q15,45 17,51 Q19,58 20,58 Q21,58 23,51 Q25,45 25,34 Z'],
  canine: ['M14,34 Q14,46 16.5,53 Q19,60 20,60 Q21,60 23.5,53 Q26,46 26,34 Z'],
  premolar: ['M14.5,34 Q14.5,45 16.5,51 Q18.5,58 20,58 Q21.5,58 23.5,51 Q25.5,45 25.5,34 Z'],
  molar: [
    'M9,34 Q9,42 10.5,47 Q12,53 13.5,53 Q15,53 16,47 Q17,42 17,34 Z',
    'M23,34 Q23,42 24,47 Q25.5,53 27,53 Q28.5,53 29.5,47 Q31,42 31,34 Z',
  ],
}

// ---------------------------------------------------------------------------
// Implant icon: a threaded fixture in a rounded socket, replacing the natural
// crown+root silhouette entirely. Same 40-wide, 58-tall box as a normal tooth.
// ---------------------------------------------------------------------------
export const IMPLANT_CAP_PATH = 'M17,2 L23,2 L23,8 L17,8 Z'
export const IMPLANT_SHAFT_PATH = 'M15,8 Q15,7 16,7 L24,7 Q25,7 25,8 L25,31 Q25,32 24,32 L16,32 Q15,32 15,31 Z'
export const IMPLANT_THREAD_YS = [11, 15, 19, 23, 27]
export const IMPLANT_BASE_PATH = 'M11,32 Q11,41 13,47 Q15,56 20,57 Q25,56 27,47 Q29,41 29,32 Z'

// Post marker: a light vertical rod overlaid on a tooth to signal a post/core
// build-up inside the root canal. Purely decorative, drawn on top of the crown+
// root fill.
export const POST_MARKER_PATH = 'M18,9 L22,9 Q22.5,9 22.5,9.5 L22.5,49 Q22.5,51 20,51 Q17.5,51 17.5,49 L17.5,9.5 Q17.5,9 18,9 Z'

// When a tooth has more than one special paint type charted on it at once (e.g.
// a crown over a root-canal-treated tooth), the most visually "final" state wins
// — implant replaces everything, crown caps what's underneath, etc. "filling"
// never wins since it isn't a shape change at all.
export const PAINT_PRIORITY: PaintType[] = ['implant', 'crown', 'post', 'endo', 'extraction', 'missing', 'filling']

// Fixed crown color for endo/post so "this tooth has root-canal work" reads at
// a glance — the root (or, for post, the marker) carries the actual status color.
export const ENDO_INDICATOR_COLOR = '#4fae87'

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
