import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createPairingScanTracker, pairingTicket, PRODUCTION_SYNC_ORIGIN, readPairingLink, sharesPairingService } from '../src/sudoku/pairing-link.ts'

test('QR scanning accepts only a pairing ticket for the current app', () => {
  const site = 'https://sudoku.example'
  const token = 'a'.repeat(64)
  const path = '/sync#pair=' + token
  assert.equal(pairingTicket(site + path, site), token)
  assert.equal(pairingTicket(site + '/sync/confirm#pair=' + token, site), token)
  assert.equal(pairingTicket(site + '/sync/#pair=' + token, site), token)
  assert.equal(pairingTicket(site + '/sync/confirm/#pair=' + token, site), token)
  assert.equal(pairingTicket(site + '/settings/device-sync#pair=' + token, site), token)
  assert.equal(pairingTicket(site + '/settings/device-sync/confirm/#pair=' + token, site), token)
  for (const text of [token, site + '/#pair=' + token, 'https://other.example' + path, site + path + 'x',
    site + '/settings/device-sync/scan#pair=' + token, site + '/settings/device-sync/confirm?next=/settings#pair=' + token,
    'https://anyone@sudoku.example' + path, site + '/sync?target=elsewhere#pair=' + token, '/sync#pair=' + token]) {
    assert.equal(pairingTicket(text, site), null)
  }
})

test('recognizes a valid code from the hosted site without accepting its ticket on localhost', () => {
  const origin = 'https://klyn-sudoku.pages.dev'
  const ticket = 'b'.repeat(64)
  const text = origin + '/sync#pair=' + ticket
  assert.deepEqual(readPairingLink(text), { origin, ticket })
  assert.equal(pairingTicket(text, 'http://localhost:8767'), null)
  assert.equal(pairingTicket(text, origin), ticket)
  assert.equal(readPairingLink('ftp://klyn-sudoku.pages.dev/sync#pair=' + ticket), null)
  assert.equal(readPairingLink('https://klyn-sudoku.pages.dev@other.example/sync#pair=' + ticket), null)
})

test('both production URLs use the same pairing service, separate from previews and local sync', () => {
  const customDomain = 'https://sudoku.klyn.gay'
  assert.equal(sharesPairingService(customDomain, PRODUCTION_SYNC_ORIGIN), true)
  assert.equal(sharesPairingService(PRODUCTION_SYNC_ORIGIN, customDomain), true)
  assert.equal(sharesPairingService(customDomain, 'http://127.0.0.1:8766'), false)
  assert.equal(sharesPairingService('https://branch.klyn-sudoku.pages.dev', PRODUCTION_SYNC_ORIGIN), false)
  assert.equal(sharesPairingService('https://sudoku.klyn.gay.example', PRODUCTION_SYNC_ORIGIN), false)
})

test('the same live pairing code must be visible for at least 500 ms', () => {
  const observe = createPairingScanTracker()
  assert.equal(observe('A', 1000), null)
  assert.equal(observe('A', 1499), null)
  assert.equal(observe('A', 1500), 'A')
})

test('missing frames, a different code, or a suspended camera restart the hold', () => {
  const observe = createPairingScanTracker()
  for (const [ticket, now] of [
    ['A', 0], ['A', 250], [null, 400], ['A', 450], ['A', 650],
    ['B', 700], ['B', 1050], ['B', 2000], ['B', 2499],
  ] as const) assert.equal(observe(ticket, now), null)
  assert.equal(observe('B', 2500), 'B')
})
