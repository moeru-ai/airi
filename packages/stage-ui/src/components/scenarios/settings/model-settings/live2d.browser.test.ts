import type { ModelSettingsRuntimeSnapshot } from './runtime'

import { createPinia } from 'pinia'
import { afterEach, describe, expect, it, vi } from 'vitest'
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
  it('renders a remote expression snapshot and emits a command without changing the local store', async () => {
    // ROOT CAUSE:
    //
    // The Electron stage renderer loaded the model and registered its expressions.
    // The separate settings renderer read a different Pinia store, so the list stayed empty.
    //
    // We fixed this by sending a serializable expression snapshot from the stage owner.
    Object.assign(window, { Live2DCubismCore: {} })
    const [{ useExpressionStore, useSettingsLive2d }, { default: Live2DSettings }] = await Promise.all([
      import('@proj-airi/stage-ui-live2d'),
      import('./live2d.vue'),
    ])

    const pinia = createPinia()
    const live2dSettings = useSettingsLive2d(pinia)
    live2dSettings.live2dExpressionEnabled = true

    const runtimeSnapshot = {
      ownerInstanceId: 'stage-owner',
      modelId: 'test-model',
      renderer: 'live2d',
      phase: 'mounted',
      controlsLocked: false,
      previewAvailable: true,
      canCapturePreview: false,
      updatedAt: 1,
      live2dExpressions: {
        groups: [
          { name: 'happy', active: false, exposedToLlm: false },
          { name: 'surprised', active: true, exposedToLlm: false },
        ],
        llmMode: 'none',
      },
    } satisfies ModelSettingsRuntimeSnapshot

    const onLive2dExpressionCommand = vi.fn()

    const screen = await render(Live2DSettings, {
      props: {
        palette: [],
        runtimeSnapshot,
        onLive2dExpressionCommand,
      },
      global: {
        plugins: [pinia, createTestI18n()],
      },
    })

    await screen.getByText('settings.live2d.expressions.title', { exact: true }).click()
    await expect.element(screen.getByText('happy', { exact: true })).toBeVisible()
    await expect.element(screen.getByText('surprised', { exact: true })).toBeVisible()

    const expressionSwitches = screen.getByRole('switch').all()
    await expressionSwitches[1].click()

    expect(onLive2dExpressionCommand).toHaveBeenCalledWith({ type: 'toggle', name: 'happy' })
    expect(useExpressionStore(pinia).expressionGroups.size).toBe(0)
  })
})
