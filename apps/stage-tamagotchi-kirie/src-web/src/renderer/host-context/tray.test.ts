import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick, ref } from 'vue'

import { startHostTrayLabels } from './tray'

const invoke = vi.hoisted(() => vi.fn())

vi.mock('@moeru/eventa', async (importOriginal) => {
  const original = await importOriginal<typeof import('@moeru/eventa')>()
  return {
    ...original,
    defineInvoke: (_context: unknown, event: { sendEvent: { id: string } }) => {
      return (...args: unknown[]) => invoke(event.sendEvent.id, ...args)
    },
  }
})

vi.mock('./owner', () => ({
  initializeHostContext: () => ({
    context: {},
  }),
}))

const setLabelsEventId = 'eventa:invoke:airi:tray:labels:set-send'

describe('host tray labels', () => {
  beforeEach(() => {
    invoke.mockReset().mockResolvedValue(undefined)
  })

  it('sends the translated Electron tray labels to Godot at start', () => {
    const locale = ref('en')
    const stop = startHostTrayLabels({ locale, t: key => `${locale.value}:${key}` })

    expect(invoke).toHaveBeenCalledOnce()
    expect(invoke).toHaveBeenCalledWith(setLabelsEventId, expect.objectContaining({
      show: 'en:tamagotchi.electron.tray.menu.labels.label.show',
      recommendedSize: 'en:tamagotchi.electron.tray.menu.labels.label.recommended_size',
      troubleshootBeatSync: 'en:tamagotchi.electron.tray.menu.labels.label.troubleshoot_beatsync',
      quit: 'en:tamagotchi.electron.tray.menu.labels.label.quit',
    }))

    stop()
  })

  it('sends the labels again after a locale change until stopped', async () => {
    const locale = ref('en')
    const stop = startHostTrayLabels({ locale, t: key => `${locale.value}:${key}` })

    locale.value = 'zh-Hans'
    await nextTick()

    expect(invoke).toHaveBeenCalledTimes(2)
    expect(invoke).toHaveBeenLastCalledWith(setLabelsEventId, expect.objectContaining({
      settings: 'zh-Hans:tamagotchi.electron.tray.menu.labels.label.settings',
    }))

    stop()
    locale.value = 'ja'
    await nextTick()

    expect(invoke).toHaveBeenCalledTimes(2)
  })
})
