export const MOBILE_PANEL_ORDER_KEY = 'sudoku-app:v1:mobile-panel-order'
export const MOBILE_PANEL_HOLD_MS = 5000
export const MOBILE_PANEL_IDS = ['puzzle', 'hint', 'input', 'completion'] as const
export type MobilePanelId = typeof MOBILE_PANEL_IDS[number]
export type PanelDrop = { id: MobilePanelId; edge: 'before' | 'after' }

export function mobilePanelOrder(value: unknown): MobilePanelId[] {
  const order = Array.isArray(value)
    ? value.filter((id): id is MobilePanelId => MOBILE_PANEL_IDS.includes(id))
    : []
  return [...new Set([...order, ...MOBILE_PANEL_IDS])]
}

export function readMobilePanelOrder(): MobilePanelId[] {
  try { return mobilePanelOrder(JSON.parse(localStorage.getItem(MOBILE_PANEL_ORDER_KEY) ?? 'null')) }
  catch { return [...MOBILE_PANEL_IDS] }
}

export function moveMobilePanel(order: readonly MobilePanelId[], id: MobilePanelId, drop: PanelDrop): MobilePanelId[] {
  if (id === drop.id || !order.includes(id) || !order.includes(drop.id)) return [...order]
  const next = order.filter((panel) => panel !== id)
  next.splice(next.indexOf(drop.id) + (drop.edge === 'after' ? 1 : 0), 0, id)
  return next
}
