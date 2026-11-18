export type GroupLineKind = 'entropic' | 'modular'

export const lineGroups = {
  entropic: { masks: [7, 56, 448], names: ['low (1–3)', 'medium (4–6)', 'high (7–9)'] },
  modular: { masks: [73, 146, 292], names: ['in {1, 4, 7}', 'in {2, 5, 8}', 'in {3, 6, 9}'] },
} as const

export function lineGroupMask(kind: GroupLineKind, digit: number) {
  return lineGroups[kind].masks[kind === 'entropic' ? Math.floor((digit - 1) / 3) : (digit - 1) % 3]
}
