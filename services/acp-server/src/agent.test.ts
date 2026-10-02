import { client, RequestError } from '@agentclientprotocol/sdk'
import { describe, expect, it } from 'vitest'

import { createAcpAgent } from './agent'
import { AIRI_DESKTOP_NOT_STARTED } from './bridge'

describe('acp agent', () => {
  it('fails session requests when the desktop is closed', async () => {
    const { app } = await createAcpAgent({
      connectBridge: async () => {
        throw new Error(AIRI_DESKTOP_NOT_STARTED)
      },
    })

    await client({ name: 'test' }).connectWith(app, async (agent) => {
      const initialized = await agent.request('initialize', { protocolVersion: 1 })
      expect(initialized.agentCapabilities?.loadSession).toBe(true)
      expect(initialized.agentCapabilities?.promptCapabilities).toMatchObject({ image: true, embeddedContext: true })
      await expect(agent.request('session/new', { cwd: '/tmp', mcpServers: [] })).rejects.toSatisfy(desktopClosed)
      await expect(agent.request('session/load', { cwd: '/tmp', mcpServers: [], sessionId: 'missing' })).rejects.toSatisfy(desktopClosed)
      await expect(agent.request('session/prompt', {
        sessionId: 'missing',
        prompt: [{ type: 'text', text: 'hello' }],
      })).rejects.toSatisfy(desktopClosed)
    })
  })

  it('turns a desktop text stream into agent message chunks and does not send a plan', async () => {
    const updates: string[] = []
    const prompts: string[] = []
    const { app } = await createAcpAgent({
      connectBridge: async () => ({
        bindSession() {},
        unbindSession() {},
        async openSession() {
          return { chatSessionId: 'chat-1' }
        },
        async loadSession() {
          return { messages: [] }
        },
        async closeSession() {},
        async prompt(input) {
          prompts.push(input.text)
          await input.publish({ type: 'text-delta', text: 'hello' })
          await input.publish({ type: 'reasoning-delta', text: 'thinking' })
          return { stopReason: 'end_turn' }
        },
      }),
    })

    await client({ name: 'test' })
      .onNotification('session/update', (ctx) => {
        updates.push(ctx.params.update.sessionUpdate)
      })
      .connectWith(app, async (agent) => {
        await agent.request('initialize', { protocolVersion: 1 })
        const created = await agent.request('session/new', { cwd: '/tmp', mcpServers: [] })
        const prompted = await agent.request('session/prompt', {
          sessionId: created.sessionId,
          prompt: [{ type: 'text', text: 'Say hello' }],
        })
        expect(created.sessionId).toBe('chat-1')
        expect(prompted.stopReason).toBe('end_turn')
      })

    expect(prompts).toEqual(['Say hello'])
    expect(updates).toEqual(['agent_message_chunk', 'agent_thought_chunk'])
    expect(updates).not.toContain('plan')
  })

  it('calls fs/read_text_file only when the ACP Client reported file read', async () => {
    const reads: string[] = []
    const { app } = await createAcpAgent({
      connectBridge: async () => ({
        bindSession() {},
        unbindSession() {},
        async openSession() {
          return { chatSessionId: 'chat-read' }
        },
        async loadSession() {
          return { messages: [] }
        },
        async closeSession() {},
        async prompt(input) {
          const text = await input.callTool({
            name: 'read_text_file',
            arguments: { path: '/tmp/note.txt' },
          })
          await input.publish({ type: 'text-delta', text })
          return { stopReason: 'end_turn' }
        },
      }),
    })

    await client({ name: 'test' })
      .onRequest('fs/read_text_file', (ctx) => {
        reads.push(ctx.params.path)
        return { content: 'note' }
      })
      .connectWith(app, async (agent) => {
        await agent.request('initialize', {
          protocolVersion: 1,
          clientCapabilities: { fs: { readTextFile: true } },
        })
        const created = await agent.request('session/new', { cwd: '/tmp', mcpServers: [] })
        const prompted = await agent.request('session/prompt', {
          sessionId: created.sessionId,
          prompt: [{ type: 'text', text: 'read it' }],
        })
        expect(prompted.stopReason).toBe('end_turn')
      })

    expect(reads).toEqual(['/tmp/note.txt'])
  })

  it('does not call fs/read_text_file when the ACP Client did not report file read', async () => {
    const reads: string[] = []
    const { app } = await createAcpAgent({
      connectBridge: async () => ({
        bindSession() {},
        unbindSession() {},
        async openSession() {
          return { chatSessionId: 'chat-closed' }
        },
        async loadSession() {
          return { messages: [] }
        },
        async closeSession() {},
        async prompt(input) {
          const text = await input.callTool({
            name: 'read_text_file',
            arguments: { path: '/tmp/note.txt' },
          })
          await input.publish({ type: 'text-delta', text })
          return { stopReason: 'end_turn' }
        },
      }),
    })

    await client({ name: 'test' })
      .onRequest('fs/read_text_file', (ctx) => {
        reads.push(ctx.params.path)
        return { content: 'note' }
      })
      .connectWith(app, async (agent) => {
        await agent.request('initialize', { protocolVersion: 1 })
        const created = await agent.request('session/new', { cwd: '/tmp', mcpServers: [] })
        await agent.request('session/prompt', {
          sessionId: created.sessionId,
          prompt: [{ type: 'text', text: 'read it' }],
        })
      })

    expect(reads).toEqual([])
  })

  it('loads an existing chat and replays its transcript', async () => {
    const updates: string[] = []
    const loaded: string[] = []
    const { app } = await createAcpAgent({
      connectBridge: async () => ({
        bindSession() {},
        unbindSession() {},
        async openSession() {
          throw new Error('session/load must not create a chat')
        },
        async loadSession(input) {
          loaded.push(input.chatSessionId)
          return {
            messages: [
              { role: 'user' as const, text: 'hello' },
              { role: 'assistant' as const, text: 'hi' },
            ],
          }
        },
        async closeSession() {},
        async prompt() {
          return { stopReason: 'end_turn' as const }
        },
      }),
    })

    await client({ name: 'test' })
      .onNotification('session/update', (ctx) => {
        const content = 'content' in ctx.params.update ? ctx.params.update.content : undefined
        const text = content && !Array.isArray(content) && content.type === 'text' ? content.text : ''
        updates.push(`${ctx.params.update.sessionUpdate}:${text}`)
      })
      .connectWith(app, async (agent) => {
        await agent.request('initialize', { protocolVersion: 1 })
        await agent.request('session/load', { cwd: '/tmp', mcpServers: [], sessionId: 'chat-1' })
      })

    expect(loaded).toEqual(['chat-1'])
    expect(updates).toEqual(['user_message_chunk:hello', 'agent_message_chunk:hi'])
  })

  it('rejects session/load when the desktop reports an unknown session', async () => {
    const { app } = await createAcpAgent({
      connectBridge: async () => ({
        bindSession() {},
        unbindSession() {},
        async openSession() {
          return { chatSessionId: 'unused' }
        },
        async loadSession() {
          throw new Error('Unknown session')
        },
        async closeSession() {},
        async prompt() {
          return { stopReason: 'end_turn' as const }
        },
      }),
    })

    await client({ name: 'test' }).connectWith(app, async (agent) => {
      await agent.request('initialize', { protocolVersion: 1 })
      await expect(agent.request('session/load', {
        cwd: '/tmp',
        mcpServers: [],
        sessionId: 'missing',
      })).rejects.toSatisfy((error: unknown) => error instanceof RequestError && error.message.includes('Unknown session'))
    })
  })
})

function desktopClosed(error: unknown) {
  return error instanceof RequestError && error.message.includes(AIRI_DESKTOP_NOT_STARTED)
}
