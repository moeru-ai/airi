import en from '@proj-airi/i18n/locales/en'
import localforage from 'localforage'

import { createPinia, disposePinia } from 'pinia'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-vue'
import { page, userEvent } from 'vitest/browser'
import { nextTick } from 'vue'
import { createI18n } from 'vue-i18n'

import Stickers from '../../components/modules/stickers.vue'

import { chatStickers } from '../../assets/stickers'
import { stickersRepo } from '../../database/repos/stickers.repo'
import { stickerEmotions } from '../../types/sticker'
import { useStickersStore } from './stickers'

import 'virtual:uno.css'

const stores: ReturnType<typeof createPinia>[] = []

function createStore() {
  const pinia = createPinia()
  stores.push(pinia)
  return useStickersStore(pinia)
}

beforeEach(async () => {
  await Promise.all(['entries', 'images'].map(storeName => localforage.createInstance({ name: 'airi-stickers', storeName }).clear()))
  localStorage.removeItem('settings/stickers/enabled')
  localStorage.removeItem('settings/stickers/frequency')
})
afterEach(async () => {
  for (const pinia of stores.splice(0))
    disposePinia(pinia)
  localStorage.removeItem('settings/stickers/enabled')
  localStorage.removeItem('settings/stickers/frequency')
  vi.restoreAllMocks()
  await Promise.all(['entries', 'images'].map(storeName => localforage.createInstance({ name: 'airi-stickers', storeName }).clear()))
})

it('requires opt-in and restores the preference when the store is recreated', async () => {
  const store = createStore()
  expect(store.enabled).toBe(false)
  expect(store.catalog).toBeUndefined()
  store.enabled = true
  await nextTick()
  expect(localStorage.getItem('settings/stickers/enabled')).toBe('true')
  const restored = createStore()
  expect(restored.catalog?.map(item => item.id)).toEqual(chatStickers.map(item => item.id))
  restored.resetState()
  await nextTick()
  expect(restored.catalog).toBeUndefined()
  expect(localStorage.getItem('settings/stickers/enabled')).toBe('false')
})

it('decodes every bundled image without an external image service', async () => {
  expect(chatStickers).toHaveLength(12)
  expect(new Set(chatStickers.flatMap(sticker => [...sticker.emotions]))).toEqual(new Set(stickerEmotions))
  for (const sticker of chatStickers) {
    const image = new Image()
    image.src = sticker.src
    await image.decode()
    expect(image.naturalWidth).toBeGreaterThan(0)
    expect(new URL(image.src).origin).toBe(location.origin)
  }
})

it('excludes unknown bundled metadata from the sendable catalog without inventing an image URL', async () => {
  await stickersRepo.save({ id: 'unrecognized-builtin', assetId: 'unrecognized-builtin', name: 'Unknown', emotions: ['happy'], deleted: false })
  const store = createStore()
  store.enabled = true
  store.frequency = 100
  expect((await store.selectCatalogForReply())?.map(item => item.id)).toEqual(chatStickers.map(item => item.id))
  expect(store.artwork['unrecognized-builtin']).toBeUndefined()
})

it.each([25, 50, 75, 100])('enforces the %i percent eligibility boundary without forcing an image', async (frequency) => {
  const store = createStore()
  const random = vi.spyOn(Math, 'random')
  store.frequency = frequency
  random.mockReturnValue(0)
  expect(await store.selectCatalogForReply()).toBeUndefined()
  expect(random).not.toHaveBeenCalled()
  store.enabled = true
  random.mockReturnValue((frequency - 1) / 100)
  expect((await store.selectCatalogForReply())?.map(item => item.id)).toEqual(chatStickers.map(item => item.id))
  random.mockReturnValue(frequency / 100)
  if (frequency < 100) {
    expect(await store.selectCatalogForReply()).toBeUndefined()
  }
  else {
    random.mockReturnValue(0.9999)
    expect((await store.selectCatalogForReply())?.map(item => item.id)).toEqual(chatStickers.map(item => item.id))
  }
})

it('persists frequency independently of the toggle and resets both preferences', async () => {
  const store = createStore()
  expect(store.frequency).toBe(50)
  store.frequency = 25
  store.enabled = true
  await nextTick()
  store.enabled = false
  await nextTick()
  const restored = createStore()
  expect(restored.enabled).toBe(false)
  expect(restored.frequency).toBe(25)
  restored.resetState()
  await nextTick()
  expect(restored.enabled).toBe(false)
  expect(restored.frequency).toBe(50)
  expect(localStorage.getItem('settings/stickers/frequency')).toBe('50')
})

it('lets users enable stickers and choose each frequency through the real settings controls', async () => {
  const pinia = createPinia()
  stores.push(pinia)
  const store = useStickersStore(pinia)
  const view = render(Stickers, {
    global: { plugins: [pinia, createI18n({ legacy: false, locale: 'en', messages: { en } })] },
  })
  const frequency = view.getByRole('combobox')
  await expect.element(frequency).toBeDisabled()
  await view.getByRole('switch').click()
  await expect.element(frequency).toBeEnabled()
  for (const [value, label] of [[25, 'Occasionally (25%)'], [50, 'Sometimes (50%)'], [75, 'Often (75%)'], [100, 'Whenever appropriate (100%)']] as const) {
    await frequency.click()
    await view.getByRole('option', { name: label, exact: true }).click()
    await expect.poll(() => store.frequency).toBe(value)
    await expect.poll(() => localStorage.getItem('settings/stickers/frequency')).toBe(String(value))
    await expect.element(frequency).toHaveTextContent(label)
  }
  await view.getByRole('switch').click()
  await expect.element(frequency).toBeDisabled()
  expect(store.frequency).toBe(100)
})

async function imageFile(color = 'red', width = 2, type = 'image/png') {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = 2
  const context = canvas.getContext('2d')!
  context.fillStyle = color
  context.fillRect(0, 0, width, 2)
  const blob = await new Promise<Blob>((resolve) => {
    canvas.toBlob(value => resolve(value!), type)
  })
  return new File([blob], 'sticker-image', { type })
}

it.each(['image/png', 'image/jpeg', 'image/webp', 'image/gif'])('imports and decodes supported %s images', async (type) => {
  const file = type === 'image/gif'
    ? new File([Uint8Array.from(atob('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'), character => character.charCodeAt(0))], 'test.gif', { type })
    : await imageFile('red', 2, type)
  const store = createStore()
  const entry = await store.add(file, 'Supported image', ['happy'])
  const image = new Image()
  image.src = store.artwork[entry.assetId]
  await image.decode()
  expect(image.naturalWidth).toBeGreaterThan(0)
})

it('keeps stickers disabled when the local library cannot be read', async () => {
  const read = vi.spyOn(stickersRepo, 'read').mockRejectedValue(new Error('Storage unavailable'))
  const store = createStore()
  await expect(store.load()).rejects.toThrow('Storage unavailable')
  expect(store.error).toBe(true)
  read.mockClear()
  expect(await store.selectCatalogForReply()).toBeUndefined()
  expect(read).not.toHaveBeenCalled()
})

it('preserves the old image and metadata if persisting replacement metadata fails', async () => {
  const store = createStore()
  const entry = await store.add(await imageFile(), 'Original', ['happy'])
  vi.spyOn(stickersRepo, 'save').mockRejectedValueOnce(new Error('Write failed'))
  await expect(store.save(entry.id, 'Replacement', ['angry'], await imageFile('blue'))).rejects.toThrow('Write failed')
  const restored = createStore()
  await restored.load()
  expect(restored.entries.find(item => item.id === entry.id)).toEqual(entry)
  const image = new Image()
  image.src = restored.artwork[entry.assetId]
  await image.decode()
  expect(image.naturalWidth).toBe(2)
})

it('reads a complete image and metadata version when another window writes a replacement', async () => {
  const first = createStore()
  const second = createStore()
  const entry = await first.add(await imageFile(), 'Original', ['happy'])
  await second.load()
  const release = Promise.withResolvers<void>()
  const originalSave = stickersRepo.saveImage
  const read = vi.spyOn(stickersRepo, 'read')
  const writeImage = vi.spyOn(stickersRepo, 'saveImage').mockImplementation(async (...args) => {
    await release.promise
    await originalSave(...args)
  })
  const pending = first.save(entry.id, 'Replacement', ['angry'], await imageFile('blue'))
  let completed = false
  let reading: Promise<void> | undefined
  try {
    await expect.poll(() => writeImage.mock.calls.length).toBe(1)
    reading = second.load().then(() => {
      completed = true
    })
    await expect.poll(() => read.mock.calls.length).toBe(1)
    await expect.poll(async () => (await navigator.locks.query()).pending?.some(lock => lock.name === 'airi:sticker-library-write')).toBe(true)
    expect(completed).toBe(false)
    expect(second.entries.find(item => item.id === entry.id)?.assetId).toBe(entry.assetId)
    release.resolve()
    await Promise.all([pending, reading])
    const replacement = second.entries.find(item => item.id === entry.id)!
    expect(replacement.name).toBe('Replacement')
    expect(replacement.assetId).not.toBe(entry.assetId)
    const image = new Image()
    image.src = second.artwork[replacement.assetId]
    await image.decode()
  }
  finally {
    release.resolve()
    await Promise.allSettled([pending, ...reading ? [reading] : []])
  }
})

it('imports multiple emotion tags, persists edits across stores, and retains old images after replacement and deletion', async () => {
  const first = createStore()
  const second = createStore()
  await Promise.all([first.load(), second.load()])
  const entry = await first.add(await imageFile(), 'Thank you', ['thanks', 'happy', 'happy'])
  first.enabled = true
  expect(first.catalog?.find(item => item.id === entry.assetId)?.description).toBe('Thank you. Emotions: thanks, happy.')
  await expect.poll(() => second.entries.find(item => item.id === entry.id)?.name).toBe('Thank you')
  await first.save(entry.id, 'Congratulations', ['celebrate', 'happy'])
  await expect.poll(() => second.entries.find(item => item.id === entry.id)?.emotions).toEqual(['celebrate', 'happy'])
  const restored = createStore()
  await restored.load()
  expect(restored.entries.find(item => item.id === entry.id)?.name).toBe('Congratulations')
  const oldImage = new Image()
  oldImage.src = restored.artwork[entry.assetId]
  await oldImage.decode()
  await first.save(entry.id, 'New image', ['agree'], await imageFile('blue'))
  const replaced = first.entries.find(item => item.id === entry.id)!
  expect(replaced.assetId).not.toBe(entry.assetId)
  expect(first.artwork[entry.assetId]).toBeTruthy()
  expect(first.artwork[replaced.assetId]).toBeTruthy()
  expect(first.catalog?.some(item => item.id === entry.assetId)).toBe(false)
  await first.remove(entry.id)
  await expect.poll(() => second.entries.some(item => item.id === entry.id)).toBe(false)
  expect(first.catalog?.some(item => item.id === replaced.assetId)).toBe(false)
  expect(first.artwork[entry.assetId]).toBeTruthy()
  expect(first.artwork[replaced.assetId]).toBeTruthy()
  const reloaded = createStore()
  await reloaded.load()
  expect(reloaded.entries.some(item => item.id === entry.id)).toBe(false)
  const retained = new Image()
  retained.src = reloaded.artwork[entry.assetId]
  await retained.decode()
  expect(retained.naturalWidth).toBe(2)
})

it('edits and hides bundled stickers while preserving saved and prepared image identities', async () => {
  const store = createStore()
  await store.load()
  store.enabled = true
  store.frequency = 100
  const builtin = chatStickers[0]
  const prepared = await store.selectCatalogForReply()
  await store.save(builtin.id, 'Friendly hello', ['happy', 'agree'])
  expect(prepared?.find(item => item.id === builtin.id)?.description).not.toBe('Friendly hello. Emotions: happy, agree.')
  expect(store.catalog?.find(item => item.id === builtin.id)?.description).toBe('Friendly hello. Emotions: happy, agree.')
  await store.remove(builtin.id)
  expect(store.catalog?.some(item => item.id === builtin.id)).toBe(false)
  expect(store.artwork[builtin.id]).toBe(builtin.src)
  const restored = createStore()
  await restored.load()
  expect(restored.entries.some(item => item.id === builtin.id)).toBe(false)
  expect(restored.artwork[builtin.id]).toBe(builtin.src)
  await expect(store.save(builtin.id, 'Cannot resurrect', ['happy'])).rejects.toThrow('missing')
})

it('serializes edits and deletion from different windows without restoring a deleted entry', async () => {
  const first = createStore()
  const second = createStore()
  await Promise.all([first.load(), second.load()])
  const entry = await first.add(await imageFile(), 'Initial', ['happy'])
  await second.load()
  await Promise.all([first.save(entry.id, 'Updated', ['thanks']), second.remove(entry.id)])
  await Promise.all([first.load(), second.load()])
  expect(first.entries.some(item => item.id === entry.id)).toBe(false)
  expect(second.entries.some(item => item.id === entry.id)).toBe(false)
  expect(first.artwork[entry.assetId]).toBeTruthy()
})

it.each([
  ['format', () => new File(['<svg/>'], 'bad.svg', { type: 'image/svg+xml' })],
  ['image', () => new File([], 'empty.png', { type: 'image/png' })],
  ['image', () => new File(['invalid image'], 'bad.png', { type: 'image/png' })],
  ['size', () => new File([new Uint8Array(2 * 1024 * 1024 + 1)], 'large.png', { type: 'image/png' })],
] as const)('rejects an invalid import (%s) without modifying the library', async (code, createFile) => {
  const store = createStore()
  await store.load()
  await expect(store.add(createFile(), 'Invalid', ['happy'])).rejects.toThrow(code)
  expect(store.entries).toHaveLength(chatStickers.length)
})

it('rejects oversized dimensions, empty names, long names, and unsupported emotion tags', async () => {
  const store = createStore()
  await store.load()
  await expect(store.add(await imageFile('red', 4097), 'Large', ['happy'])).rejects.toThrow('dimensions')
  const image = await imageFile()
  await expect(store.add(image, ' ', ['happy'])).rejects.toThrow('name')
  await expect(store.add(image, 'x'.repeat(81), ['happy'])).rejects.toThrow('name')
  await expect(store.add(image, 'Valid name', [])).rejects.toThrow('emotions')
  await expect(store.add(image, 'Valid name', ['invented'])).rejects.toThrow('emotions')
  expect(store.entries).toHaveLength(chatStickers.length)
})

it('imports, previews, edits, replaces, and deletes through the real settings form', async () => {
  const pinia = createPinia()
  stores.push(pinia)
  const store = useStickersStore(pinia)
  const view = render(Stickers, { global: { plugins: [pinia, createI18n({ legacy: false, locale: 'en', messages: { en } })] } })
  await store.load()
  await view.getByRole('button', { name: 'Import image', exact: true }).click()
  await userEvent.upload(view.container.querySelector('input[type="file"]')!, await imageFile())
  await expect.element(view.getByRole('img', { name: 'Sticker preview' })).toBeVisible()
  await view.getByRole('textbox').fill('Local thanks')
  await view.getByRole('button', { name: 'Thanks', exact: true }).click()
  await view.getByRole('button', { name: 'Happy', exact: true }).click()
  await view.getByRole('button', { name: 'Save sticker', exact: true }).click()
  await expect.element(view.getByText('Local thanks', { exact: true })).toBeVisible()
  const entry = store.entries.find(item => item.name === 'Local thanks')!
  expect(entry.emotions).toEqual(['thanks', 'happy'])
  const originalAssetId = entry.assetId
  const card = page.elementLocator(view.getByText('Local thanks', { exact: true }).element().closest('li')!)
  await card.getByRole('button', { name: 'Edit', exact: true }).click()
  await view.getByRole('textbox').fill('Changed thanks')
  await userEvent.upload(view.container.querySelector('input[type="file"]')!, await imageFile('blue'))
  await expect.element(view.getByRole('img', { name: 'Sticker preview' })).toBeVisible()
  await view.getByRole('button', { name: 'Save sticker', exact: true }).click()
  await expect.element(view.getByText('Changed thanks', { exact: true })).toBeVisible()
  expect(store.entries.find(item => item.id === entry.id)?.assetId).not.toBe(originalAssetId)
  const updated = page.elementLocator(view.getByText('Changed thanks', { exact: true }).element().closest('li')!)
  await updated.getByRole('button', { name: 'Delete', exact: true }).click()
  await view.getByRole('button', { name: 'Confirm delete', exact: true }).click()
  await expect.poll(() => store.entries.some(item => item.id === entry.id)).toBe(false)
  expect(store.artwork[originalAssetId]).toBeTruthy()
  await view.getByRole('button', { name: 'Import image', exact: true }).click()
  await userEvent.upload(view.container.querySelector('input[type="file"]')!, new File(['bad data'], 'invalid.png', { type: 'image/png' }))
  await expect.element(view.getByRole('alert')).toHaveTextContent('This image cannot be opened')
  await expect.element(view.getByRole('button', { name: 'Save sticker', exact: true })).toBeDisabled()
})
