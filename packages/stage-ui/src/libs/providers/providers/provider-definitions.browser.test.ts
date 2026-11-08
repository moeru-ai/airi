import type { ProviderTranslator } from '@proj-airi/provider-inference'

import { afterEach, expect, it } from 'vitest'
import { page } from 'vitest/browser'
import { z } from 'zod'

import { getDefinedProvider } from './registry'

import './index'

const translate = ((key: string) => key) as ProviderTranslator

afterEach(() => {
  localStorage.removeItem('settings/language')
})

it.each([
  { locale: 'en', language: 'en' },
  { locale: 'zh-Hans', language: 'zh' },
])('accepts each Sherpaw model with the saved $locale language and rejects unsupported IDs', async ({ locale, language }) => {
  await page.viewport(1280, 720)
  localStorage.setItem('settings/language', locale)
  const definition = getDefinedProvider('sherpaw-transcription')
  if (!definition)
    throw new Error('The Sherpaw transcription provider is not registered.')

  const schema = await definition.createProviderConfig({ t: translate })

  expect(z.parse(schema, {})).toEqual({ model: 'paraformer-zh-en', modelLanguageFilter: language })
  for (const model of ['paraformer-zh-en', 'zipformer-multilingual', 'x-asr-zh-en-480ms-int8'])
    expect(z.parse(schema, { model })).toEqual({ model, modelLanguageFilter: language })
  expect(z.safeParse(schema, { model: 'zipformer-zh-en' }).success).toBe(false)
  expect(z.safeParse(schema, { model: 'unknown-model' }).success).toBe(false)
})
