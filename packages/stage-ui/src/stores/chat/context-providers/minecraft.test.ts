import { createPinia, setActivePinia } from 'pinia'
import { describe, expect, it, vi } from 'vitest'

import { useMinecraftStore } from '../../modules/gaming-minecraft'
import { createMinecraftContext } from './minecraft'

vi.mock('../../mods/api/channel-server', () => ({
  useModsServerChannelStore: () => ({
    onContextUpdate: () => () => {},
    onEvent: () => () => {},
    send: () => {},
  }),
}))

describe('createMinecraftContext', () => {
  it('returns null when the local minecraft integration toggle is disabled', () => {
    setActivePinia(createPinia())

    const store = useMinecraftStore()
    store.integrationEnabled = false

    expect(createMinecraftContext()).toBeNull()
  })

  it('uses live runtime context text when the bot has pushed context', () => {
    setActivePinia(createPinia())

    const store = useMinecraftStore()
    store.integrationEnabled = true
    store.latestRuntimeContextText = 'Bot online: airi-bot\nServer: mc.example.com:25565' as any

    const context = createMinecraftContext()

    expect(context).not.toBeNull()
    expect(context?.strategy).toBe('replace-self')
    expect(context?.text).toContain('Minecraft integration is enabled')
    expect(context?.text).toContain('AIRI can oversee a connected Minecraft bot')
    expect(context?.text).toContain('Bot online: airi-bot')
  })
})
