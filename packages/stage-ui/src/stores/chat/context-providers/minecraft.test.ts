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
  it('returns null when no minecraft service has been observed yet', () => {
    setActivePinia(createPinia())

    expect(createMinecraftContext()).toBeNull()
  })

  it('uses live runtime context text when the bot has pushed context', () => {
    setActivePinia(createPinia())

    const store = useMinecraftStore()
    store.latestRuntimeContextText = 'Bot online: airi-bot\nServer: mc.example.com:25565' as any
    store.lastRuntimeContextAt = Date.now() as any

    const context = createMinecraftContext()

    expect(context).not.toBeNull()
    expect(context?.strategy).toBe('replace-self')
    expect(context?.text).toContain('Minecraft integration is active because AIRI has observed a Minecraft service')
    expect(context?.text).toContain('AIRI can oversee a connected Minecraft bot')
    expect(context?.text).toContain('Bot online: airi-bot')
  })
})
