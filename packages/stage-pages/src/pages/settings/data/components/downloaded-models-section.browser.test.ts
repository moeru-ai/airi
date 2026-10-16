import en from '@proj-airi/i18n/locales/en'

import { updateModelAssetStatus } from '@proj-airi/stage-ui/composables/use-model-asset-status'
import { kwsModel } from '@proj-airi/stage-ui/libs/voice/kws-model-info'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-vue'
import { createI18n } from 'vue-i18n'

import DownloadedModelsSection from './downloaded-models-section.vue'

import 'virtual:uno.css'

const { list, remove, cancel } = vi.hoisted(() => ({
  list: vi.fn(async () => []),
  remove: vi.fn(async (_id: string) => {}),
  cancel: vi.fn(async (_id: string) => {}),
}))

vi.mock('@proj-airi/stage-ui/libs/providers/providers/sherpaw/model-assets', () => ({
  listSherpawModelAssets: list,
  removeSherpawModelAssets: remove,
  cancelSherpawModelAssets: cancel,
  isSherpawModelBundled: () => false,
}))

const model = {
  id: 'zipformer-multilingual',
  revision: 'fce043ac9738950d5cd223955b86656bfaa42311',
} as const

describe('downloaded speech models in Data settings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    updateModelAssetStatus({ ...model, state: 'missing' })
  })

  async function renderSection() {
    return render(DownloadedModelsSection, {
      global: {
        plugins: [createI18n({ legacy: false, locale: 'en', messages: { en } })],
      },
    })
  }

  it('lists an installed model and removes the selected model after confirmation', async () => {
    updateModelAssetStatus({ ...model, state: 'installed' })
    remove.mockImplementationOnce(async () => {
      updateModelAssetStatus({ ...model, state: 'missing' })
    })
    const screen = await renderSection()

    await expect.element(screen.getByText('Zipformer')).toBeVisible()
    await screen.getByRole('button', { name: 'Remove download' }).click()
    await screen.getByRole('button', { name: 'Yes' }).click()

    await expect.poll(() => remove).toHaveBeenCalledWith(model.id)
    await expect.element(screen.getByText('No speech models are downloaded.')).toBeVisible()
  })

  it('offers cancellation while a model is downloading', async () => {
    updateModelAssetStatus({ ...model, state: 'downloading' })
    cancel.mockImplementationOnce(async () => {
      updateModelAssetStatus({ ...model, state: 'missing' })
    })
    const screen = await renderSection()

    await expect.element(screen.getByText('Zipformer')).toBeVisible()
    await screen.getByRole('button', { name: 'Cancel' }).click()

    await expect.poll(() => cancel).toHaveBeenCalledWith(model.id)
    await expect.element(screen.getByText('No speech models are downloaded.')).toBeVisible()
  })
  it('lists a downloaded wake word model by its purpose', async () => {
    const wakeWordModel = { id: kwsModel.id, revision: kwsModel.revision }
    updateModelAssetStatus({ ...wakeWordModel, state: 'installed' })
    const screen = await renderSection()

    await expect.element(screen.getByText('Wake word model')).toBeVisible()
    updateModelAssetStatus({ ...wakeWordModel, state: 'missing' })
  })
})
