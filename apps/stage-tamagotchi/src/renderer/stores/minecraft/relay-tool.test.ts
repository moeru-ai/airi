import type { WebSocketEvents } from '@proj-airi/server-sdk'

import { describe, expect, it, vi } from 'vitest'

import { createRelayToMinecraftTool } from './relay-tool'

const execMeta = { messages: [], toolCallId: 'tool-call-id' }

async function makeTool(overrides?: { isAvailable?: () => boolean }) {
  const sendSparkCommand = vi.fn<(command: WebSocketEvents['spark:command']) => void>()
  const onRelay = vi.fn()
  const tools = await createRelayToMinecraftTool({
    sendSparkCommand,
    isAvailable: overrides?.isAvailable ?? (() => true),
    onRelay,
  })
  return { tool: tools[0], sendSparkCommand, onRelay }
}

/** @example describe('createRelayToMinecraftTool', () => {}) */
describe('createRelayToMinecraftTool', () => {
  /** @example it('exposes a single relayToMinecraft tool', async () => {}) */
  it('exposes a single relayToMinecraft tool', async () => {
    const { tool } = await makeTool()
    // @example
    expect(tool.function.name).toBe('relayToMinecraft')
  })

  // Codex P2: the bot can de-announce between registration and invocation; execute must re-check.
  /** @example it('refuses and does not send when the bot is no longer available', async () => {}) */
  it('refuses and does not send when the bot is no longer available', async () => {
    const { tool, sendSparkCommand, onRelay } = await makeTool({ isAvailable: () => false })
    const result = await tool.execute({ task: 'follow me', ack: null, control: null }, execMeta)
    // @example
    expect(sendSparkCommand).not.toHaveBeenCalled()
    // @example
    expect(onRelay).not.toHaveBeenCalled()
    // @example
    expect(result).toContain('offline')
  })

  /** @example it('does not send an empty task', async () => {}) */
  it('does not send an empty task', async () => {
    const { tool, sendSparkCommand } = await makeTool()
    const result = await tool.execute({ task: '   ', ack: null, control: null }, execMeta)
    // @example
    expect(sendSparkCommand).not.toHaveBeenCalled()
    // @example
    expect(result).toContain('empty task')
  })

  /** @example it('relays a do command with the complete task', async () => {}) */
  it('relays a "do" command carrying the FULL task text in guidance.options[0].label', async () => {
    const { tool, sendSparkCommand, onRelay } = await makeTool()
    const task = 'follow me to that far birch forest, chop all mature birch logs, then come back'
    const result = await tool.execute({ task, ack: 'Yes, master, right away.', control: 'do' }, execMeta)

    // @example
    expect(sendSparkCommand).toHaveBeenCalledTimes(1)
    const command = sendSparkCommand.mock.calls[0][0]
    // @example
    expect(command.intent).toBe('action')
    // @example
    expect(command.interrupt).toBe('soft')
    // @example
    expect(command.priority).toBe('normal')
    // The bot relays options[0].label to its brain — it MUST be the whole instruction, not truncated.
    // @example
    expect(command.guidance?.options?.[0].label).toBe(task)
    // @example
    expect(command.ack).toBe('Yes, master, right away.')
    // Targets the bot directly; an empty array would match no peer and drop the relay.
    // @example
    expect(command.destinations).toEqual(['minecraft-bot'])
    // @example
    expect(onRelay).toHaveBeenCalledWith({ task, control: 'do', ack: 'Yes, master, right away.' })
    // @example
    expect(result).toContain('relayed to the in-game Airi')
  })

  /** @example it('relays a stop command as a forceful high-priority interrupt', async () => {}) */
  it('relays a "stop" command as a forceful high-priority interrupt', async () => {
    const { tool, sendSparkCommand } = await makeTool()
    const result = await tool.execute({ task: 'stop mining', ack: null, control: 'stop' }, execMeta)

    const command = sendSparkCommand.mock.calls[0][0]
    // @example
    expect(command.interrupt).toBe('force')
    // @example
    expect(command.priority).toBe('high')
    // @example
    expect(command.guidance?.options?.[0].label).toContain('Immediately stop')
    // @example
    expect(command.guidance?.options?.[0].steps).toContain('Stop every current action')
    // @example
    expect(result).toContain('stop')
  })

  /** @example it('defaults a null control to do', async () => {}) */
  it('defaults a null control to "do"', async () => {
    const { tool, sendSparkCommand } = await makeTool()
    await tool.execute({ task: 'come here', ack: null, control: null }, execMeta)
    const command = sendSparkCommand.mock.calls[0][0]
    // @example
    expect(command.interrupt).toBe('soft')
    // @example
    expect(command.priority).toBe('normal')
  })
})
