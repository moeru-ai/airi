import type { ModelAssetStatus } from '@proj-airi/stage-shared/model-assets'

import en from '@proj-airi/i18n/locales/en'

import { speakerModel } from '@proj-airi/stage-shared/speaker-model'
import { expect, it } from 'vitest'
import { render } from 'vitest-browser-vue'
import { createI18n } from 'vue-i18n'

import ModelAssetProgress from './model-asset-progress.vue'

const failed: ModelAssetStatus = {
  id: speakerModel.id,
  revision: speakerModel.revision,
  state: 'error',
  error: { reason: 'network', host: 'huggingface.co', message: 'Model asset download failed. Could not connect to huggingface.co: fetch failed.' },
}

it('explains a failed download and asks the host to retry it', async () => {
  const screen = render(ModelAssetProgress, {
    props: { statuses: [failed] },
    global: { plugins: [createI18n({ legacy: false, locale: 'en', messages: { en } })] },
  })

  await expect.element(screen.getByText('Could not connect to huggingface.co. Check your network or proxy settings.')).toBeVisible()
  expect(screen.container.textContent).not.toContain('fetch failed')

  await screen.getByRole('button', { name: 'Retry' }).click()
  expect(screen.emitted('retry')).toEqual([[speakerModel.id]])
})

it('shows no retry action while a model downloads', async () => {
  const screen = render(ModelAssetProgress, {
    props: { statuses: [{ ...failed, state: 'downloading', error: undefined }] },
    global: { plugins: [createI18n({ legacy: false, locale: 'en', messages: { en } })] },
  })

  await expect.element(screen.getByText('Voiceprint model')).toBeVisible()
  expect(screen.getByRole('button', { name: 'Retry' }).query()).toBeNull()
})
