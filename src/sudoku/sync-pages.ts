export const syncPageTitles = {
  scan: 'Scan QR code',
  recover: 'Recover sync',
  confirm: 'Link this device?',
  devices: 'Device sync',
  invite: 'Link another device',
}

export type SyncPage = keyof typeof syncPageTitles

export function isSyncPage(step: string): step is SyncPage {
  return Object.hasOwn(syncPageTitles, step)
}
