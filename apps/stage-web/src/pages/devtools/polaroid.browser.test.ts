import type { Component } from 'vue'

import { DisplayModelFormat, useDisplayModelsStore } from '@proj-airi/stage-ui/stores/display-models'
import { useSettingsStageModel } from '@proj-airi/stage-ui/stores/settings/stage-model'
import { createPinia } from 'pinia'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createApp } from 'vue'

import PocketPolaroid from '../../../../stage-pocket/src/pages/devtools/polaroid.vue'
import WebPolaroid from './polaroid.vue'

import 'virtual:uno.css'

let presetArchive: Blob
const layoutStyle = document.createElement('style')

beforeAll(async () => {
  layoutStyle.textContent = `
    .polaroid-browser-test {
      height: 700px;
      overflow: hidden;
      width: 800px;
    }

    .polaroid-browser-test > div {
      height: 700px !important;
      width: 800px !important;
    }

    .polaroid-browser-test > div > div:first-child {
      flex: none !important;
      height: 600px !important;
      width: 800px !important;
    }
  `
  document.head.appendChild(layoutStyle)

  await import('@proj-airi/stage-ui-live2d/utils/live2d-zip-loader')
  await import('@proj-airi/stage-ui-live2d/utils/live2d-opfs-registration')

  const pinia = createPinia()
  const displayModels = useDisplayModelsStore(pinia)
  const preset = await displayModels.getDisplayModel('preset-live2d-2')
  if (preset?.type !== 'url')
    throw new Error('The Live2D test preset is unavailable.')

  const response = await fetch(preset.url)
  if (!response.ok)
    throw new Error(`Failed to load the Live2D test preset: ${response.status}`)

  presetArchive = await response.blob()
})

beforeEach(() => {
  localStorage.removeItem('settings/stage/model')
})

afterEach(() => {
  localStorage.removeItem('settings/stage/model')
})

afterAll(() => {
  layoutStyle.remove()
})

async function renderPolaroid(component: Component, modelId: string) {
  const pinia = createPinia()
  const displayModels = useDisplayModelsStore(pinia)
  const settings = useSettingsStageModel(pinia)
  const file = new File([presetArchive], 'imported-live2d.zip', { type: 'application/zip' })
  const container = document.createElement('div')
  container.className = 'polaroid-browser-test'
  document.body.appendChild(container)

  // NOTICE:
  // Keep each app mounted until Vitest closes the browser page. Vue DevTools
  // schedules inspector work after app.unmount(), which rejects after teardown.
  // Source/context: the Stage Web Vite config used by this browser test.
  // Removal condition: Vue DevTools supports component-test app teardown.
  const app = createApp(component)
  app.use(pinia)
  app.mount(container)

  displayModels.displayModels.unshift({
    id: modelId,
    format: DisplayModelFormat.Live2dZip,
    type: 'file',
    file,
    name: file.name,
    importedAt: Date.now(),
  })

  settings.stageModelSelected = modelId
  await settings.updateStageModel()
  await expect.poll(() => settings.stageModelSelectedUrl).toMatch(/^blob:/)

  return container
}

async function expectImportedModelPhoto(component: Component, modelId: string) {
  const container = await renderPolaroid(component, modelId)

  await expect.poll(() => container.querySelector('option'), { timeout: 20_000 }).toBeInstanceOf(HTMLOptionElement)

  const canvas = container.querySelector('canvas')
  if (!(canvas instanceof HTMLCanvasElement))
    throw new TypeError('Polaroid did not render a canvas.')

  expect(canvas.toDataURL('image/png')).toMatch(/^data:image\/png;base64,./)
}

describe('polaroid imported Live2D model', () => {
  it('loads and captures an imported model on the web page', async () => {
    // ROOT CAUSE:
    //
    // Polaroid passed only the object URL to the Live2D loader. An imported
    // model uses a blob URL without the .zip suffix, so the loader also needs
    // the selected display model ID to resolve the archive from OPFS.
    //
    // The loader also kept its mutex locked when the first render had no model
    // source. We fixed both paths by passing the selected ID and releasing the
    // mutex across every early return.
    await expectImportedModelPhoto(WebPolaroid, 'display-model-polaroid-web')
  })

  it('loads and captures an imported model on the pocket page', async () => {
    await expectImportedModelPhoto(PocketPolaroid, 'display-model-polaroid-pocket')
  })
})
