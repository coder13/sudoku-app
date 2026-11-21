export const deviceSyncPath = '/settings/device-sync'

export const syncStepTitles = {
  scan: 'Scan QR code',
  recover: 'Recover sync',
  confirm: 'Link this device?',
  invite: 'Link another device',
}

export type SyncStep = keyof typeof syncStepTitles

export function isSyncStep(step: string): step is SyncStep {
  return Object.hasOwn(syncStepTitles, step)
}
