import { createPinia, setActivePinia } from 'pinia'
import { describe, expect, it, vi } from 'vitest'

import { useMinecraftStore } from '../../modules/gaming-minecraft'
import { createMinecraftContext } from './minecraft'

vi.mock('../../mods/api/channel-server', () => ({
  useModsServerChannelStore: () => ({
    onContextUpdate: () => () => {},
    send: () => {},
  }),
}))

describe('createMinecraftContext', () => {
  it('returns null when there is no applied minecraft config yet', () => {
    setActivePinia(createPinia())

    const store = useMinecraftStore()
    store.enabled = false

    expect(createMinecraftContext()).toBeNull()
  })

  it('describes the lightweight AIRI shell from the last applied remote config', () => {
    setActivePinia(createPinia())

    const store = useMinecraftStore()
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

    // Local draft edits should not change the self-knowledge context until saved.
    store.enabled = false
    store.serverAddress = 'draft.example.com'
    store.serverPort = 24444
    store.username = 'draft-bot'
    store.botState = 'connected'

    const context = createMinecraftContext()

    expect(context).not.toBeNull()
    expect(context?.strategy).toBe('replace-self')
    expect(context?.text).toContain('Minecraft integration is enabled')
    expect(context?.text).toContain('AIRI can oversee a connected Minecraft bot')
    expect(context?.text).toContain('Current bot status: connected')
    expect(context?.text).toContain('mc.example.com:25565')
    expect(context?.text).not.toContain('draft.example.com:24444')
  })
})
