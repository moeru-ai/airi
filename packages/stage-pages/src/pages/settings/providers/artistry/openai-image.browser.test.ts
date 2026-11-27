import en from '@proj-airi/i18n/locales/en'

import { resolveArtistryConfigFromStore, useArtistryStore } from '@proj-airi/stage-ui/stores/modules/artistry'
import { createPinia, disposePinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { render } from 'vitest-browser-vue'
import { nextTick } from 'vue'
import { createI18n } from 'vue-i18n'

import OpenAIImage from './openai-image.vue'

let pinia: ReturnType<typeof createPinia>

beforeEach(() => {
  localStorage.clear()
  pinia = createPinia()
  setActivePinia(pinia)
})

afterEach(() => {
  disposePinia(pinia)
  localStorage.clear()
})

// Invalid dimensions previously reached persistent state on every keystroke.
it('saves only valid dimension pairs and supports clearing defaults', async () => {
  const screen = render(OpenAIImage, { global: {
    plugins: [pinia, createI18n({ legacy: false, locale: 'en', messages: { en } })],
  } })
  const width = screen.getByRole('spinbutton', { name: /^Default width/ })
  const height = screen.getByRole('spinbutton', { name: /^Default height/ })
  const save = screen.getByRole('button', { name: 'Save dimensions' })
  const warning = screen.getByText('Enter both dimensions as positive multiples of 16, or leave both blank. Invalid edits are not saved.')
  await expect.element(width).toHaveValue(null)
  await expect.element(height).toHaveValue(null)
  await width.fill('0')
  await height.fill('1024')
  await expect.element(warning).toBeVisible()
  await expect.element(save).toBeDisabled()
  await width.fill('1920')
  await height.fill('1080')
  await nextTick()
  expect(useArtistryStore().openaiImageWidth).toBe('')
  expect(useArtistryStore().openaiImageHeight).toBe('')
  await expect.element(save).toBeDisabled()
  expect(localStorage.getItem('artistry-openai-image-width')).toBe('')
  expect(localStorage.getItem('artistry-openai-image-height')).toBe('')
  await height.fill('1088')
  await expect.element(warning).not.toBeInTheDocument()
  await save.click()
  await nextTick()
  expect(useArtistryStore().openaiImageWidth).toBe('1920')
  expect(useArtistryStore().openaiImageHeight).toBe('1088')
  await height.fill('1080')
  await expect.element(save).toBeDisabled()
  expect(localStorage.getItem('artistry-openai-image-height')).toBe('1088')
  await height.fill('1088')
  await width.fill('')
  await expect.element(save).toBeDisabled()
  await height.fill('')
  await save.click()
  await nextTick()
  expect(useArtistryStore().artistryGlobals).toMatchObject({ openaiImageWidth: '', openaiImageHeight: '' })
  expect(localStorage.getItem('artistry-openai-image-width')).toBe('')
  expect(localStorage.getItem('artistry-openai-image-height')).toBe('')
  await expect.element(warning).not.toBeInTheDocument()
})

it('edits independent image credentials, persists them, and resets them', async () => {
  const screen = render(OpenAIImage, { global: {
    plugins: [pinia, createI18n({ legacy: false, locale: 'en', messages: { en } })],
  } })
  const store = useArtistryStore()
  store.nanobananaApiKey = 'other-provider-key'
  store.globalProvider = 'openai-image'
  await nextTick()
  expect(store.configured).toBe(false)
  await expect.element(screen.getByPlaceholder('gpt-image-2.6-sunburst')).toHaveValue('gpt-image-2.6-sunburst')
  await screen.getByPlaceholder('Enter your image API key').fill('image-key')
  await screen.getByPlaceholder('https://api.openai.com/v1/').fill('https://example.com/openai/v1')
  await screen.getByPlaceholder('gpt-image-2.6-sunburst').fill('gpt-image-2')
  const width = screen.getByRole('spinbutton', { name: /^Default width/ })
  const height = screen.getByRole('spinbutton', { name: /^Default height/ })
  await width.fill('1536')
  await height.fill('1024')
  await screen.getByRole('button', { name: 'Save dimensions' }).click()
  await nextTick()
  expect(store.configured).toBe(true)
  expect(store.nanobananaApiKey).toBe('other-provider-key')
  expect(resolveArtistryConfigFromStore(store).globals).toMatchObject({
    openaiImageApiKey: 'image-key',
    openaiImageBaseUrl: 'https://example.com/openai/v1',
    openaiImageModel: 'gpt-image-2',
    openaiImageWidth: '1536',
    openaiImageHeight: '1024',
  })
  await screen.unmount()
  disposePinia(pinia)
  pinia = createPinia()
  setActivePinia(pinia)
  const restored = useArtistryStore()
  expect(restored.openaiImageApiKey).toBe('image-key')
  expect(restored.openaiImageBaseUrl).toBe('https://example.com/openai/v1')
  expect(restored.openaiImageModel).toBe('gpt-image-2')
  expect(restored.openaiImageWidth).toBe('1536')
  expect(restored.openaiImageHeight).toBe('1024')
  restored.resetState()
  await nextTick()
  expect(restored.openaiImageApiKey).toBe('')
  expect(restored.openaiImageModel).toBe('gpt-image-2.6-sunburst')
  expect(restored.openaiImageWidth).toBe('')
  expect(restored.openaiImageHeight).toBe('')
  expect(localStorage.getItem('artistry-openai-image-api-key')).toBe('')
})
