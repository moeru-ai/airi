import type { JsonSchema } from 'xsschema'

import { describe, expect, it, vi } from 'vitest'

import {
  buildOpenClawSparkCommand,
  executeOpenClawTool,
  extractExplicitOpenClawTask,
  openclaw,
} from './openclaw'

describe('tools openclaw', () => {
  it('emits a strict tool schema', async () => {
    const tools = await openclaw(() => {})
    const openclawTool = tools.find(entry => entry.function.name === 'delegate_openclaw_task')

    expect(openclawTool).toBeDefined()
    expect(openclawTool?.function.parameters.additionalProperties).toBe(false)

    const props = (openclawTool!.function.parameters as JsonSchema).properties!
    expect((props.task as JsonSchema).type).toBe('string')
    expect((props.conversationId as JsonSchema).type).toBe('string')
    expect((props.userId as JsonSchema).type).toBe('string')
  })

  it('builds a spark command that the OpenClaw bridge can recognize', () => {
    const command = buildOpenClawSparkCommand({
      conversationId: 'conversation-1',
      replyDestinations: ['proj-airi:stage-ui'],
      returnMode: 'summary',
      source: 'stage-ui:test',
      task: 'Summarize the current repository status.',
      taskContexts: [
        {
          lane: 'notes',
          metadata: { priority: 'high' },
          text: 'Only include uncommitted changes.',
        },
      ],
      userId: 'user-1',
    })

    expect(command.destinations).toEqual(['openclaw-bridge'])
    expect(command.intent).toBe('action')

    const taskContext = command.contexts?.[0]
    expect(taskContext?.lane).toBe('openclaw:task')
    expect(taskContext?.text).toBe('Summarize the current repository status.')
    expect(taskContext?.metadata).toMatchObject({
      openclaw: {
        conversationId: 'conversation-1',
        replyDestinations: ['proj-airi:stage-ui'],
        returnMode: 'summary',
        source: 'stage-ui:test',
        taskText: 'Summarize the current repository status.',
        userId: 'user-1',
      },
    })

    expect(command.contexts?.[1]).toMatchObject({
      lane: 'notes',
      metadata: { priority: 'high' },
      text: 'Only include uncommitted changes.',
    })
  })

  it('executes by sending the delegated spark command', async () => {
    const sendSparkCommand = vi.fn()
    const result = await executeOpenClawTool({
      conversationId: 'conversation-2',
      task: 'Collect context for a delegated task.',
      userId: 'user-2',
    }, sendSparkCommand)

    expect(sendSparkCommand).toHaveBeenCalledTimes(1)
    expect(sendSparkCommand.mock.calls[0]?.[0]).toMatchObject({
      destinations: ['openclaw-bridge'],
      intent: 'action',
      contexts: [
        {
          lane: 'openclaw:task',
          strategy: 'replace-self',
          metadata: {
            openclaw: {
              conversationId: 'conversation-2',
              returnMode: 'structured',
              source: 'stage-ui:openclaw-tool',
              taskText: 'Collect context for a delegated task.',
              userId: 'user-2',
            },
          },
          text: 'Collect context for a delegated task.',
        },
      ],
    })
    expect(result).toContain('Delegated OpenClaw task via spark:command')
  })

  it('waits for the final OpenClaw result when a waiter is provided', async () => {
    const sendSparkCommand = vi.fn()
    const waitForOpenClawResult = vi.fn().mockResolvedValue({
      status: 'completed',
      summary: '/Users/airi',
    })

    const result = await executeOpenClawTool({
      conversationId: 'conversation-3',
      task: 'pwd',
      userId: 'user-3',
    }, sendSparkCommand, waitForOpenClawResult)

    expect(sendSparkCommand).toHaveBeenCalledTimes(1)
    expect(waitForOpenClawResult).toHaveBeenCalledTimes(1)
    expect(waitForOpenClawResult).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
      conversationId: 'conversation-3',
      task: 'pwd',
      userId: 'user-3',
    }))
    expect(result).toBe('/Users/airi')
  })

  it('registers the waiter before sending the command', async () => {
    const callOrder: string[] = []
    const sendSparkCommand = vi.fn(async () => {
      callOrder.push('send')
    })
    const waitForOpenClawResult = vi.fn(async () => {
      callOrder.push('wait')
      return {
        status: 'completed' as const,
        summary: 'ok',
      }
    })

    const result = await executeOpenClawTool({
      conversationId: 'conversation-4',
      task: 'pwd',
      userId: 'user-4',
    }, sendSparkCommand, waitForOpenClawResult)

    expect(callOrder).toEqual(['wait', 'send'])
    expect(result).toBe('ok')
  })

  it('extracts explicit OpenClaw task text from chat phrasing', () => {
    expect(extractExplicitOpenClawTask('請用 OpenClaw 執行這個任務：pwd')).toBe('pwd')
    expect(extractExplicitOpenClawTask('請交給 OpenClaw 處理：nvidia-smi')).toBe('nvidia-smi')
    expect(extractExplicitOpenClawTask('普通聊天訊息')).toBeUndefined()
  })
})
