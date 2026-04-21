import { expect, test } from 'vitest'

test('sacrificial branch protection smoke fails intentionally', () => {
  expect('merge-gate should block this PR').toBe('this assertion intentionally fails')
})
