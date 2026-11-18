import assert from 'node:assert/strict'
import { test } from 'node:test'
import { pairingTicket } from '../src/sudoku/pairing-link.ts'

test('QR scanning accepts only a pairing ticket for the current app', () => {
  const site = 'https://sudoku.example'
  const token = 'a'.repeat(64)
  const path = '/sync#pair=' + token
  assert.equal(pairingTicket(site + path, site), token)
  for (const text of [token, site + '/#pair=' + token, 'https://other.example' + path, site + path + 'x',
    'https://anyone@sudoku.example' + path, site + '/sync?target=elsewhere#pair=' + token, '/sync#pair=' + token]) {
    assert.equal(pairingTicket(text, site), null)
  }
})
