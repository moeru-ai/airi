import { Buffer } from 'node:buffer'

import messages from '@proj-airi/i18n/locales'

import { all } from '@proj-airi/i18n'
import { expect, it } from 'vitest'
import { createI18n } from 'vue-i18n'

import * as v from 'valibot'

import { describeActivityLabel } from './labels'
import { importMaru } from './maru'
import { activitySchema, shortSleepDays } from './model'

const activity = { id: 'stable', label: '睡眠', category: 'sleep' as const, color: '#abcdef', start: 120, end: 255, days: [0] }
it('separates source/display labels without changing identity, sleep category, or original data', () => {
  const before = JSON.stringify(activity)
  const view = describeActivityLabel(activity, 'fr', key => key === 'routines.labels.sleep' ? 'Sommeil' : key)
  expect(view).toMatchObject({ sourceLabel: '睡眠', displayLabel: 'Sommeil', activityId: 'stable', category: 'sleep', semanticLabel: 'sleep' })
  expect(JSON.stringify(activity)).toBe(before)
})
it('keeps unknown text and uses only the explicitly selected locale translation', () => {
  const item = { ...activity, label: 'custom name', displayLabels: { fr: 'Nom personnel', ja: '個人の名前' } }
  expect(describeActivityLabel(item, 'fr', key => key).displayLabel).toBe('Nom personnel')
  expect(describeActivityLabel(item, 'en', key => key)).toMatchObject({ sourceLabel: 'custom name', displayLabel: 'custom name', semanticLabel: null })
})
it('validates optional display translations without accepting unsupported locales or hostile markup', () => {
  expect(v.safeParse(activitySchema, { ...activity, displayLabels: { fr: 'Sommeil' } }).success).toBe(true)
  expect(v.safeParse(activitySchema, { ...activity, displayLabels: { 'pt-BR': 'Descanso' } }).success).toBe(true)
  expect(v.safeParse(activitySchema, { ...activity, displayLabels: { xx: 'guess' } }).success).toBe(false)
  expect(v.safeParse(activitySchema, { ...activity, displayLabels: { en: '<img src=x>' } }).success).toBe(false)
  expect(v.safeParse(activitySchema, { ...activity, displayLabels: { en: 'x'.repeat(161) } }).success).toBe(false)
})

it('prefers a custom display label for the locale over the translated label', () => {
  const translator = createI18n({ legacy: false, locale: 'en', messages, missingWarn: false, fallbackWarn: false }).global
  expect(describeActivityLabel(activity, 'en', key => translator.t(key)).displayLabel).toBe('Sleep')
  const custom = { ...activity, displayLabels: { en: 'Rest' } }
  expect(describeActivityLabel(custom, 'en', key => translator.t(key)).displayLabel).toBe('Rest')
})

it.each(Object.keys(all))('presents the eleven reference activities in %s while preserving their source and sleep rules', (locale) => {
  const entries = [['睡眠', 120, 255, 0], ['食事', 255, 525, 5], ['移動', 525, 555, 11], ['仕事', 555, 735, 1], ['食事', 735, 780, 5], ['仕事', 780, 1110, 1], ['食事', 1110, 1155, 5], ['仕事', 1155, 1260, 1], ['趣味', 1260, 1380, 7], ['入浴', 1380, 1410, 2], ['趣味', 1410, 120, 7]]
  const code = Buffer.from(JSON.stringify({ v: 1, t: '', s: '', c: 2, e: entries })).toString('base64url')
  const routine = importMaru(`https://kxn4t.github.io/maru-ichinichi/#d=${code}`, 'Asia/Tokyo')
  const before = JSON.stringify(routine)
  const translator = createI18n({ legacy: false, locale, messages }).global
  const labels = { sleep: translator.t('routines.labels.sleep'), travel: translator.t('routines.labels.travel'), work: translator.t('routines.labels.work'), hobby: translator.t('routines.labels.hobby'), bathing: translator.t('routines.labels.bathing') }
  const output = routine.activities.map(activity => describeActivityLabel(activity, locale, key => translator.t(key)))
  expect(output).toHaveLength(11)
  expect(output[0].displayLabel).toBe(labels.sleep)
  expect(output[2].displayLabel).toBe(labels.travel)
  expect(output[3].displayLabel).toBe(labels.work)
  expect(output[8].displayLabel).toBe(labels.hobby)
  expect(output[9].displayLabel).toBe(labels.bathing)
  expect(output.map(item => item.sourceLabel)).toEqual(entries.map(entry => entry[0]))
  expect(output.map(item => item.activityId)).toEqual(routine.activities.map(activity => activity.id))
  expect(shortSleepDays(routine.activities)).toHaveLength(7)
  expect(JSON.stringify(routine)).toBe(before)
})
