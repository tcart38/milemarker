import { test } from 'node:test'
import assert from 'node:assert/strict'
import { csvDate } from '../src/routes/import.js'

test('ISO and year-first dates parse regardless of the date format', () => {
  for (const fmt of ['MM/DD/YYYY', 'DD/MM/YYYY', 'YYYY/MM/DD']) {
    assert.equal(csvDate('2026-01-31', fmt), '2026-01-31')
    assert.equal(csvDate('2026/1/31', fmt), '2026-01-31')
  }
})

test('slashed day/month dates follow the date format', () => {
  assert.equal(csvDate('3/4/2026', 'MM/DD/YYYY'), '2026-03-04')
  assert.equal(csvDate('3/4/2026', 'DD/MM/YYYY'), '2026-04-03')
  assert.equal(csvDate('3/4/2026', 'YYYY/MM/DD'), '2026-03-04')
})

test('impossible dates are rejected', () => {
  assert.equal(csvDate('31/01/2026', 'MM/DD/YYYY'), null)
  assert.equal(csvDate('2026-02-30'), null)
  assert.equal(csvDate('soon'), null)
})
