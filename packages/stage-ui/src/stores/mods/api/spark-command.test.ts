import type { WebSocketBaseEvent, WebSocketEvents } from '@proj-airi/server-sdk'

import { OWNER_AUDIENCE } from '@proj-airi/core-agent'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useSchedulerStore } from '../../scheduler'
import { useModuleDirectoryStore } from './module-directory'
import { sendAdmittedSparkCommand } from './spark-command'

type Handler = (event: WebSocketBaseEvent<any, any>) => void | Promise<void>

const channel = vi.hoisted(() => ({
  handlers: new Map<string, Handler>(),
  send: vi.fn(),
}))

vi.mock('./channel-server', () => ({
  useModsServerChannelStore: () => ({
    send: channel.send,
    onEvent: (type: string, handler: Handler) => {
      channel.handlers.set(type, handler)
      return () => channel.handlers.delete(type)
    },
  }),
}))

const command: WebSocketEvents['spark:command'] = {
  id: 'command',
  commandId: 'command',
  interrupt: false,
  priority: 'normal',
  intent: 'action',
  destinations: ['minecraft'],
}

describe('admitted spark commands', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    channel.handlers.clear()
    channel.send.mockReset()
  })

  function announce(cognition: unknown, metadata: Record<string, unknown> = {}) {
    useModuleDirectoryStore().listen()
    return channel.handlers.get('registry:modules:sync')?.({
      type: 'registry:modules:sync',
      data: { modules: [{ name: 'minecraft', identity: { kind: 'plugin', id: 'minecraft', plugin: { id: 'minecraft' } }, connectionId: 'minecraft-connection', cognition }] },
      metadata,
    } as unknown as WebSocketBaseEvent<'registry:modules:sync', WebSocketEvents['registry:modules:sync']>)
  }

  function startRun() {
    const { runs } = useSchedulerStore()
    runs.admit({ runId: 'run', envelope: { sessionId: 'session', bindings: [], outputs: ['chat:owner'], audience: OWNER_AUDIENCE } })
    runs.transition('run', 'working')
  }

  it('sends a command from a working run to a declared module with its holder', async () => {
    await announce({ accepts: ['action'], control: { exclusive: true } })
    startRun()

    expect(sendAdmittedSparkCommand('run', command)).toBeUndefined()
    expect(channel.send).toHaveBeenCalledWith({ type: 'spark:command', data: { ...command, holder: 'session' } })
  })

  it('rejects a command without a run and names the modules that accept the intent', async () => {
    await announce({ accepts: ['action'] })

    expect(sendAdmittedSparkCommand(undefined, command)).toEqual({ rejected: 'no-active-run. Modules that accept "action": minecraft' })
    expect(channel.send).not.toHaveBeenCalled()
  })

  it('ignores a module list that a peer forged', async () => {
    await announce({ accepts: ['action'] }, { originConnectionId: 'forger' })
    startRun()

    expect(sendAdmittedSparkCommand('run', command)).toMatchObject({ rejected: expect.stringContaining('unknown-destination') })
    expect(channel.send).not.toHaveBeenCalled()
  })
})
