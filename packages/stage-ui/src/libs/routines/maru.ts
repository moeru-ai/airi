import type { Routine } from './model'

import { nanoid } from 'nanoid'

import * as v from 'valibot'

import { colorSchema, displayText, routineSchema } from './model'

const palette = ['#8E9AE8', '#5FA8E8', '#6EC6D9', '#7FCFA0', '#C4D86A', '#F5C95C', '#F4A07A', '#EE7F86', '#E9A7C9', '#B79BEA', '#D8B48C', '#A9B3C2']
const minute = v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(1439))
const maruSchema = v.strictObject({
  v: v.literal(1),
  t: displayText,
  s: displayText,
  c: v.picklist([0, 1, 2]),
  e: v.pipe(v.array(v.strictTuple([
    v.pipe(displayText, v.minLength(1)),
    minute,
    minute,
    v.union([v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(11)), colorSchema]),
  ])), v.minLength(1), v.maxLength(60)),
})

/**
 * Imports a bounded Maru v1 URL without fetching or executing its contents.
 * Output always requires user review and has reminders disabled.
 */
export function importMaru(input: string, timeZone: string): Routine {
  if (input.length > 65536)
    throw new Error('input-too-large')
  const url = new URL(input.trim())
  if (url.origin !== 'https://kxn4t.github.io' || url.pathname !== '/maru-ichinichi/' || url.search || url.username || url.password)
    throw new Error('invalid-maru-url')
  const match = /^#d=([\w+/-]+={0,2})$/.exec(url.hash)
  if (!match)
    throw new Error('invalid-base64')
  const code = match[1].replace(/-/g, '+').replace(/_/g, '/')
  const unpadded = code.replace(/=+$/, '')
  if (unpadded.length % 4 === 1 || (code.includes('=') && code.length % 4 !== 0))
    throw new Error('invalid-base64')
  const binary = atob(unpadded)
  if (btoa(binary).replace(/=+$/, '') !== unpadded)
    throw new Error('noncanonical-base64')
  const bytes = Uint8Array.from(binary, char => char.charCodeAt(0))
  const json = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  const data = v.parse(maruSchema, JSON.parse(json))
  return v.parse(routineSchema, {
    id: nanoid(),
    title: data.t,
    subtitle: data.s,
    timeZone,
    activities: data.e.map(([label, start, end, color]) => ({
      id: nanoid(),
      label,
      start,
      end,
      category: /^(?:睡眠|sleep|sono|dormir)$/i.test(label.trim()) ? 'sleep' : 'other',
      color: typeof color === 'number' ? palette[color] : color,
      days: [0, 1, 2, 3, 4, 5, 6],
    })),
    reviewed: false,
    shortSleepAcknowledged: false,
    enabled: false,
    remindersEnabled: false,
    advanceMinutes: 15,
    pausedUntil: 0,
  })
}

/** Converts a bounded minute of day into an editor-compatible wall time. */
export function minutesToTime(minute: number): string {
  v.parse(v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(1439)), minute)
  return `${Math.floor(minute / 60).toString().padStart(2, '0')}:${(minute % 60).toString().padStart(2, '0')}`
}

/** Rejects ambiguous, partial, or out-of-range editor values. */
export function timeToMinutes(time: string): number {
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time))
    throw new Error('invalid-time')
  return Number(time.slice(0, 2)) * 60 + Number(time.slice(3))
}
