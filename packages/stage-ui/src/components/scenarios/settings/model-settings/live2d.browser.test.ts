import type { ModelSettingsRuntimeSnapshot } from './runtime'

import { createPinia } from 'pinia'
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render } from 'vitest-browser-vue'
import { createI18n } from 'vue-i18n'

function createTestI18n() {
  return createI18n({
    legacy: false,
    locale: 'en',
    missingWarn: false,
    fallbackWarn: false,
    messages: { en: {} },
  })
}

describe('live2D model settings', () => {
  afterEach(() => {
    cleanup()
    localStorage.clear()
  })

  // https://github.com/moeru-ai/airi/issues/2450
  // ROOT CAUSE:
  // The settings window and stage window do not share a local expression store.
  // Character controls live in the card store. Preview selection uses synchronized state.
  it('shows character expressions and updates their policy and preview state', async () => {
    Object.assign(window, { Live2DCubismCore: {} })
    const [{ useSettingsLive2d }, { useAiriCardStore }, { useSharedLive2D }, { default: Live2DSettings }] = await Promise.all([
      import('@proj-airi/stage-ui-live2d'),
      import('../../../../stores/modules/airi-card'),
      import('../../../../stores/live2d'),
      import('./live2d.vue'),
    ])

    const pinia = createPinia()
    useSettingsLive2d(pinia).live2dExpressionEnabled = true

    const runtimeSnapshot = {
      ownerInstanceId: 'stage-owner',
      modelId: 'test-model',
      renderer: 'live2d',
      phase: 'mounted',
      controlsLocked: false,
      previewAvailable: true,
      canCapturePreview: false,
      updatedAt: 1,
    } satisfies ModelSettingsRuntimeSnapshot

    const screen = await render(Live2DSettings, {
      props: { palette: [], runtimeSnapshot },
      global: { plugins: [pinia, createTestI18n()] },
    })

    const cards = useAiriCardStore(pinia)
    cards.cards.set('default', {
      name: 'ReLU',
      version: '1.0.0',
      extensions: {
        airi: {
          avatarModels: [{
            id: 'test-avatar',
            displayModelId: 'test-model',
            type: 'live2d',
            config: { controls: { disabledExpressions: [], disabledMotions: [] } },
          }],
          defaultAvatarModelId: 'test-avatar',
          modules: {
            consciousness: { provider: '', model: '' },
            speech: { provider: '', model: '', voice_id: '' },
            vision: { provider: '', model: '' },
          },
          agents: {},
        },
      },
    })
    cards.selectedAvatarModelId = 'test-avatar'
    cards.activeLive2DModelControls = {
      expressions: [
        { name: 'happy', fileName: 'happy.exp3.json' },
        { name: 'surprised', fileName: 'surprised.exp3.json' },
      ],
      motions: [],
    }

    await screen.getByText('settings.live2d.expressions.title', { exact: true }).click()
    await expect.element(screen.getByText('happy', { exact: true })).toBeVisible()
    await expect.element(screen.getByText('surprised', { exact: true })).toBeVisible()

    await screen.getByRole('switch', { name: 'settings.live2d.expressions.actions.hide-from-airi' }).first().click()
    await expect.poll(() => cards.selectedAvatarModel?.type === 'live2d'
      ? cards.selectedAvatarModel.config.controls.disabledExpressions
      : []).toContain('happy')

    await screen.getByRole('button', { name: 'settings.live2d.expressions.actions.activate' }).first().click()
    await expect.poll(() => useSharedLive2D(pinia).expressionPreview).toEqual({
      avatarModelId: 'test-avatar',
      names: ['happy'],
    })
  })
})
