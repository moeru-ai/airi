import type { DisplayModel } from '../../../../../stores/display-models'

import { createPinia } from 'pinia'
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render } from 'vitest-browser-vue'
import { createI18n } from 'vue-i18n'

import ModelStrip from './model-strip.vue'

import { DisplayModelFormat, useDisplayModelsStore } from '../../../../../stores/display-models'

function createTestI18n() {
  return createI18n({
    legacy: false,
    locale: 'en',
    missingWarn: false,
    fallbackWarn: false,
    messages: { en: {} },
  })
}

function createModel(id: string): DisplayModel {
  return { id, name: id, format: DisplayModelFormat.Live2dZip, type: 'url', url: `https://example.com/${id}.zip`, importedAt: 0 }
}

/** Mounts the strip with three models. Each download waits until the test resolves it. */
async function renderStrip() {
  const pinia = createPinia()
  const store = useDisplayModelsStore(pinia)
  store.displayModels = ['a', 'b', 'c'].map(createModel)

  const downloads = new Map<string, (model: DisplayModel) => void>()
  store.ensureDisplayModelAvailable = (id: string) => new Promise<DisplayModel>((resolve) => {
    downloads.set(id, resolve)
  })

  const screen = await render(ModelStrip, {
    props: { selectedId: 'a' },
    global: { plugins: [pinia, createTestI18n()] },
  })
  const picks = () => (screen.emitted<[DisplayModel]>().pick ?? []).map(([model]) => model.id)

  return { screen, downloads, picks }
}

describe('modelStrip', () => {
  afterEach(() => {
    cleanup()
  })

  // https://github.com/moeru-ai/airi/pull/3297#discussion_r4435204144
  // ROOT CAUSE:
  // Each tap awaited its own download and emitted on completion. A slow older download
  // replaced the selection of a newer tap.
  it('picks only the latest tapped model when an older download finishes last', async () => {
    const { screen, downloads, picks } = await renderStrip()

    await screen.getByRole('radio', { name: 'b' }).click()
    await expect.poll(() => downloads.has('b')).toBe(true)
    await screen.getByRole('radio', { name: 'c' }).click()
    await expect.poll(() => downloads.has('c')).toBe(true)

    downloads.get('c')!(createModel('c'))
    await expect.poll(picks).toEqual(['c'])

    downloads.get('b')!(createModel('b'))
    await new Promise(resolve => setTimeout(resolve, 50))
    expect(picks()).toEqual(['c'])
  })

  it('drops a pending tap when the selection changes from outside', async () => {
    const { screen, downloads, picks } = await renderStrip()

    await screen.getByRole('radio', { name: 'b' }).click()
    await expect.poll(() => downloads.has('b')).toBe(true)
    await screen.rerender({ selectedId: 'c' })

    downloads.get('b')!(createModel('b'))
    await new Promise(resolve => setTimeout(resolve, 50))
    expect(picks()).toEqual([])
    await expect.element(screen.getByRole('radio', { name: 'c' })).toHaveAttribute('aria-checked', 'true')
  })
})
