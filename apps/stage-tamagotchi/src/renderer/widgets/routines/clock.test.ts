import { expect, it } from 'vitest'

import { clockInterval, clockPoint, clockRotation } from './clock'

it('places midnight at the top, noon at the bottom, and clips an overnight carry-in to this date', () => {
  expect(clockPoint(0).x).toBeCloseTo(120)
  expect(clockPoint(0).y).toBeCloseTo(30)
  expect(clockPoint(720).y).toBeCloseTo(210)
  expect(clockInterval(Date.parse('2026-10-22T02:30Z'), Date.parse('2026-10-22T05:00Z'), '2026-10-22', 'America/Sao_Paulo')).toEqual([0, 120])
  expect(clockInterval(Date.parse('2026-10-23T02:30Z'), Date.parse('2026-10-23T05:00Z'), '2026-10-22', 'America/Sao_Paulo')).toEqual([1410, 1440])
})

it('keeps the animated hand moving forward across midnight in the routine time zone', () => {
  const before = clockRotation(Date.parse('2026-10-23T02:59:00Z'), '2026-10-22', 'America/Sao_Paulo')
  const after = clockRotation(Date.parse('2026-10-23T03:01:00Z'), '2026-10-22', 'America/Sao_Paulo')
  expect(before).toBeCloseTo(359.75)
  expect(after).toBeCloseTo(360.25)
  expect(after - before).toBeCloseTo(0.5)
})
