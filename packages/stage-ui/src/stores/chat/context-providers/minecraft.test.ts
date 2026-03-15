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

  it('describes the passive minecraft shell from the last observed runtime status', () => {
    setActivePinia(createPinia())

    const store = useMinecraftStore()
    store.integrationEnabled = true
    store._handleStatusUpdate({
      data: {
        lane: 'minecraft:status',
        content: {
          serviceName: 'minecraft-bot',
          botState: 'connected',
          editableConfig: {
            enabled: true,
            host: 'mc.example.com',
            port: 25565,
            username: 'airi-bot',
          },
          updatedAt: 1,
        },
      },
      metadata: {
        source: {
          plugin: { id: 'minecraft-bot' },
          id: 'minecraft-bot-instance',
        },
      },
    } as any)

    const context = createMinecraftContext()

    expect(context).not.toBeNull()
    expect(context?.strategy).toBe('replace-self')
    expect(context?.text).toContain('Minecraft integration is enabled')
    expect(context?.text).toContain('AIRI can oversee a connected Minecraft bot')
    expect(context?.text).toContain('Current bot status: connected')
    expect(context?.text).toContain('mc.example.com:25565')
  })
})
