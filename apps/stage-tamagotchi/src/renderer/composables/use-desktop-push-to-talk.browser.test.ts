import { afterEach, expect, it, vi } from 'vitest'
import { createApp, defineComponent, h, ref } from 'vue'

import { useDesktopPushToTalk } from './use-desktop-push-to-talk'

const shortcutMock = vi.hoisted(() => ({
  trigger: undefined as undefined | ((event: { body: { id: string, phase: 'down' | 'up' } }) => void),
}))

vi.mock('@proj-airi/electron-vueuse', () => ({
  getElectronEventaContext: () => ({
    on: (_event: unknown, handler: typeof shortcutMock.trigger) => {
      shortcutMock.trigger = handler
      return () => {
        shortcutMock.trigger = undefined
      }
    },
  }),
  useElectronEventaInvoke: () => vi.fn().mockResolvedValue({ ok: true }),
}))

afterEach(() => {
  shortcutMock.trigger = undefined
  localStorage.removeItem('settings/audio/input/push-to-talk-shortcut')
  localStorage.removeItem('settings/audio/input/push-to-talk-shortcut-error')
})

it('invalidates a released hold while microphone startup is pending', async () => {
  let finishStartup!: () => void
  const startup = new Promise<void>((resolve) => {
    finishStartup = resolve
  })
  const recorded = vi.fn()
  const end = vi.fn().mockResolvedValue(undefined)
  const host = document.createElement('div')
  const app = createApp(defineComponent({
    setup() {
      useDesktopPushToTalk({
        enabled: ref(true),
        begin: async (isHeld) => {
          await startup
          if (isHeld())
            recorded()
        },
        end,
      })
      return () => h('div')
    },
  }))
  app.mount(host)

  shortcutMock.trigger?.({ body: { id: 'voice-push-to-talk', phase: 'down' } })
  await Promise.resolve()
  shortcutMock.trigger?.({ body: { id: 'voice-push-to-talk', phase: 'up' } })
  finishStartup()
  await vi.waitFor(() => expect(end).toHaveBeenCalledOnce())

  expect(recorded).not.toHaveBeenCalled()
  app.unmount()
})
