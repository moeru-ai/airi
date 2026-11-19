import { Buffer } from 'node:buffer'

import { describe, expect, it } from 'vitest'

import { importMaru, minutesToTime, timeToMinutes } from './maru'

const realCode = 'eyJ2IjoxLCJ0IjoiIiwicyI6IiIsImMiOjIsImUiOltbIuedoeecoCIsMTIwLDI1NSwwXSxbIumjn-S6iyIsMjU1LDUyNSw1XSxbIuenu-WLlSIsNTI1LDU1NSwxMV0sWyLku5XkuosiLDU1NSw3MzUsMV0sWyLpo5_kuosiLDczNSw3ODAsNV0sWyLku5XkuosiLDc4MCwxMTEwLDFdLFsi6aOf5LqLIiwxMTEwLDExNTUsNV0sWyLku5XkuosiLDExNTUsMTI2MCwxXSxbIui2o-WRsyIsMTI2MCwxMzgwLDddLFsi5YWl5rW0IiwxMzgwLDE0MTAsMl0sWyLotqPlkbMiLDE0MTAsMTIwLDddXX0='
function url(value: unknown) {
  return `https://kxn4t.github.io/maru-ichinichi/#d=${Buffer.from(JSON.stringify(value)).toString('base64url')}`
}
function payload(entries: unknown[] = [['睡眠', 120, 255, 0]]) {
  return { v: 1, t: '', s: '', c: 2, e: entries }
}

describe('maru import', () => {
  it('preserves the actual eleven Japanese activities and palette', () => {
    const result = importMaru(`https://kxn4t.github.io/maru-ichinichi/#d=${realCode}`, 'America/Sao_Paulo')
    expect(result.activities).toHaveLength(11)
    expect(result.activities[0]).toMatchObject({ label: '睡眠', start: 120, end: 255, color: '#8E9AE8', category: 'sleep' })
    expect(result.activities[10]).toMatchObject({ label: '趣味', start: 1410, end: 120, color: '#EE7F86' })
    expect(result.reviewed).toBe(false)
    expect(result.enabled).toBe(false)
    expect(result.remindersEnabled).toBe(false)
    expect(result.activities[0].days).toEqual([0, 1, 2, 3, 4, 5, 6])
  })

  it('accepts a custom hex color and unpadded URL-safe Base64', () => {
    const result = importMaru(url(payload([['食事', 10, 20, '#123aBc']])), 'UTC')
    expect(result.activities[0].color).toBe('#123aBc')
  })

  it.each([
    payload([['x', -1, 50, 0]]),
    payload([['x', 0.5, 50, 0]]),
    payload([['x', 0, 1440, 0]]),
    payload([['x', 10, 10, 0]]),
    payload([['x', 0, 20, 12]]),
    payload([['x', 0, 20, 'url(javascript:x)']]),
    payload([['<img onerror=alert(1)>', 0, 20, 0]]),
    payload([['x\u0000', 0, 20, 0]]),
    payload([['', 0, 20, 0]]),
    payload([['x', 0, 20, 0, 'extra']]),
    payload([['x', 0, 20, 0], ['y', 19, 30, 1]]),
    payload([['x', 1400, 20, 0], ['y', 0, 30, 1]]),
    payload(Array.from({ length: 61 }, () => ['x', 0, 20, 0])),
    { ...payload(), v: 2 },
    { ...payload(), evil: true },
    JSON.parse('{"v":1,"t":"","s":"","c":2,"e":[],"__proto__":{}}'),
  ])('rejects invalid or hostile structures: %j', (value) => {
    expect(() => importMaru(url(value), 'UTC')).toThrow()
  })

  it.each([
    'https://evil.example/#d=e30',
    'javascript:alert(1)',
    'https://kxn4t.github.io/maru-ichinichi/#d=***',
    'https://kxn4t.github.io/maru-ichinichi/#d=_w',
    'https://kxn4t.github.io/maru-ichinichi/#d=e30=garbage',
    `https://kxn4t.github.io/maru-ichinichi/#d=${'A'.repeat(100000)}`,
  ])('rejects invalid URLs and encoding', (value) => {
    expect(() => importMaru(value, 'UTC')).toThrow()
  })

  it('rejects an unknown time zone', () => {
    expect(() => importMaru(url(payload()), 'Invalid/Zone')).toThrow()
  })

  it('converts minute values without accepting invalid times', () => {
    expect(minutesToTime(1410)).toBe('23:30')
    expect(timeToMinutes('02:00')).toBe(120)
    expect(() => timeToMinutes('24:00')).toThrow()
    expect(() => timeToMinutes('2:00')).toThrow()
    expect(() => minutesToTime(1440)).toThrow()
  })
})
