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
  it('returns null when the minecraft integration is disabled', () => {
    setActivePinia(createPinia())

    const store = useMinecraftStore()
    store.enabled = false

    expect(createMinecraftContext()).toBeNull()
  })

  it('describes the lightweight AIRI shell and current runtime status when enabled', () => {
    setActivePinia(createPinia())

    const store = useMinecraftStore()
    store.enabled = true
    store.serverAddress = 'mc.example.com'
    store.serverPort = 25565
    store.username = 'airi-bot'
    store.botState = 'connected'
    store.serviceName = 'minecraft-bot'

    const context = createMinecraftContext()

    expect(context).not.toBeNull()
    expect(context?.strategy).toBe('replace-self')
    expect(context?.text).toContain('Minecraft integration is enabled')
    expect(context?.text).toContain('AIRI can oversee a connected Minecraft bot')
    expect(context?.text).toContain('Current bot status: connected')
    expect(context?.text).toContain('mc.example.com:25565')
  })
})
