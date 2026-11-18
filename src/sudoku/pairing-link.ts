// A QR code supplies a ticket for this app. Its contents are never used as a navigation target.
export function pairingTicket(text: string, origin: string): string | null {
  try {
    const url = new URL(text)
    if (url.origin !== origin || url.username || url.password || url.pathname !== '/sync' || url.search) return null
    return /^#pair=([a-f0-9]{64})$/.exec(url.hash)?.[1] ?? null
  } catch { return null }
}
