// A QR code supplies a ticket for this app. Its contents are never used as a navigation target.
export function pairingTicket(text: string, origin: string): string | null {
  try {
    const url = new URL(text)
    const path = url.pathname.replace(/\/$/, '')
    if (url.origin !== origin || url.username || url.password || url.search ||
        (path !== '/sync' && path !== '/sync/confirm')) return null
    return /^#pair=([a-f0-9]{64})$/.exec(url.hash)?.[1] ?? null
  } catch { return null }
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
