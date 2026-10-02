import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'

import { useModuleDirectoryStore } from './module-directory'
import { useSpeechDeviceStore } from './speech-device'

interface TestEvent {
  type: string
  data: unknown
  metadata: { originConnectionId?: string }
}

type Handler = (event: TestEvent) => void | Promise<void>

const channel = vi.hoisted(() => ({ handlers: new Map<string, Handler>() }))

vi.mock('./channel-server', () => ({
  useModsServerChannelStore: () => ({
    send: vi.fn(),
    onEvent: (type: string, handler: Handler) => {
      channel.handlers.set(type, handler)
      return () => channel.handlers.delete(type)
    },
  }),
}))

function emit(type: string, data: unknown, originConnectionId?: string) {
  return channel.handlers.get(type)?.({ type, data, metadata: originConnectionId ? { originConnectionId } : {} })
}

function announce(modules: Array<{ name: string, connectionId: string, cognition?: unknown }>) {
  return emit('registry:modules:sync', { modules: modules.map(module => ({ ...module, identity: { kind: 'plugin', id: module.name, plugin: { id: module.name } } })) })
}

describe('speech devices', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    channel.handlers.clear()
    useModuleDirectoryStore().listen()
    useSpeechDeviceStore().listen()
  })

  it('accepts a device only for a declared scene of its module', async () => {
    await announce([
      { name: 'discord', connectionId: 'discord-connection', cognition: { scenes: [{ binding: 'discord:channel:' }] } },
      { name: 'vscode', connectionId: 'vscode-connection' },
    ])

    await emit('speech:device', { binding: 'discord:channel:voice-a', active: true }, 'discord-connection')
    await emit('speech:device', { binding: 'owner:private', active: true }, 'discord-connection')
    // A module without scenes speaks for the owner, so it cannot add an audience through a device.
    await emit('speech:device', { binding: 'vscode:editor', active: true }, 'vscode-connection')

    expect(useSpeechDeviceStore().devices).toEqual([{ binding: 'discord:channel:voice-a', connectionId: 'discord-connection' }])
    expect(useSpeechDeviceStore().forBindings(['discord:channel:voice-a'])?.connectionId).toBe('discord-connection')
  })

  it('removes a device when its module withdraws it or leaves', async () => {
    await announce([{ name: 'discord', connectionId: 'discord-connection', cognition: { scenes: [{ binding: 'discord:channel:' }] } }])
    await emit('speech:device', { binding: 'discord:channel:a', active: true }, 'discord-connection')
    await emit('speech:device', { binding: 'discord:channel:b', active: true }, 'discord-connection')

    await emit('speech:device', { binding: 'discord:channel:a', active: false }, 'discord-connection')
    expect(useSpeechDeviceStore().devices.map(device => device.binding)).toEqual(['discord:channel:b'])

    await announce([])
    await nextTick()
    expect(useSpeechDeviceStore().devices).toEqual([])
  })
})
