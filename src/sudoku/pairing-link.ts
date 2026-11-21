import { deviceSyncPath } from './sync-steps.ts'

export const PRODUCTION_SYNC_ORIGIN = 'https://klyn-sudoku.pages.dev'
const pairingPaths = new Set(['/sync', '/sync/confirm', deviceSyncPath, deviceSyncPath + '/confirm'])
const productionOrigins = new Set([PRODUCTION_SYNC_ORIGIN, 'https://sudoku.klyn.gay'])

export function isProductionSyncOrigin(origin: string): boolean {
  return productionOrigins.has(origin)
}

export function sharesPairingService(origin: string, expectedOrigin: string): boolean {
  return origin === expectedOrigin || (isProductionSyncOrigin(origin) && isProductionSyncOrigin(expectedOrigin))
}

// Parse the source address separately so the scanner can explain a site mismatch.
export function readPairingLink(text: string): { origin: string; ticket: string } | null {
  try {
    const url = new URL(text)
    const path = url.pathname.replace(/\/$/, '')
    if ((url.protocol !== 'https:' && url.protocol !== 'http:') || url.username || url.password || url.search ||
        !pairingPaths.has(path)) return null
    const ticket = /^#pair=([a-f0-9]{64})$/.exec(url.hash)?.[1]
    return ticket ? { origin: url.origin, ticket } : null
  } catch { return null }
}

// Only accept tickets for this site. Never navigate to a URL supplied by a QR code.
export function pairingTicket(text: string, origin: string): string | null {
  const link = readPairingLink(text)
  return link?.origin === origin ? link.ticket : null
}

/** Feed consecutive camera observations to this tracker until a ticket stays in view for half a second. */
export function createPairingScanTracker() {
  const holdMs = 500
  let previous: string | null = null
  let firstSeen = 0
  let lastSeen = 0

  return (ticket: string | null, now: number): string | null => {
    if (ticket !== previous || now - lastSeen > holdMs) firstSeen = now
    previous = ticket
    lastSeen = now
    return ticket && now - firstSeen >= holdMs ? ticket : null
  }
}
