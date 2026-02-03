import type { Action } from '../../libs/mineflayer/action'

import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

import { JavaScriptPlanner } from './js-planner'

function createAction(name: string, schema: Action['schema']): Action {
  return {
    name,
    description: `${name} tool`,
    execution: 'sync',
    schema,
    perform: () => () => '',
  }
}

const actions: Action[] = [
  createAction('chat', z.object({ message: z.string() })),
  createAction('goToPlayer', z.object({
    player_name: z.string(),
    closeness: z.number().min(0),
  })),
]

describe('javaScriptPlanner', () => {
  const globals = {
    event: {
      type: 'perception',
      payload: { type: 'chat_message' },
      source: { type: 'minecraft', id: 'test' },
      timestamp: Date.now(),
    },
    snapshot: {
      self: { health: 20, food: 20, location: { x: 0, y: 64, z: 0 } },
      environment: { nearbyPlayers: [] },
      social: {},
      threat: {},
      attention: {},
    },
    llmInput: {
      systemPrompt: 'system prompt',
      userMessage: 'latest user message',
      messages: [{ role: 'user', content: 'hello' }],
      conversationHistory: [{ role: 'assistant', content: 'previous reply' }],
      updatedAt: Date.now(),
      attempt: 1,
    },
  } as any

  it('maps positional/object args and executes tools in order', async () => {
    const planner = new JavaScriptPlanner()
    const executeAction = vi.fn(async action => `ok:${action.tool}`)
    const planned = await planner.evaluate(`
      await chat("hello")
      await goToPlayer({ player_name: "Alex", closeness: 2 })
    `, actions, globals, executeAction)

    expect(executeAction).toHaveBeenCalledTimes(2)
    expect(executeAction).toHaveBeenNthCalledWith(1, { tool: 'chat', params: { message: 'hello' } })
    expect(executeAction).toHaveBeenNthCalledWith(2, { tool: 'goToPlayer', params: { player_name: 'Alex', closeness: 2 } })
    expect(planned.actions.map(a => a.action)).toEqual([
      { tool: 'chat', params: { message: 'hello' } },
      { tool: 'goToPlayer', params: { player_name: 'Alex', closeness: 2 } },
    ])
  })

  it('supports dynamic dispatch with use(toolName, params)', async () => {
    const planner = new JavaScriptPlanner()
    const executeAction = vi.fn(async action => `ok:${action.tool}`)
    const planned = await planner.evaluate(`await use("chat", { message: "via-use" })`, actions, globals, executeAction)

    expect(planned.actions.map(a => a.action)).toEqual([{ tool: 'chat', params: { message: 'via-use' } }])
  })

  it('persists script variables across turns with mem', async () => {
    const planner = new JavaScriptPlanner()
    const executeAction = vi.fn(async action => `ok:${action.tool}`)

    await planner.evaluate('mem.count = 2', actions, globals, executeAction)
    const planned = await planner.evaluate('await chat("count=" + mem.count)', actions, globals, executeAction)

    expect(planned.actions.map(a => a.action)).toEqual([{ tool: 'chat', params: { message: 'count=2' } }])
  })

  it('provides snapshot globals in script scope', async () => {
    const planner = new JavaScriptPlanner()
    const executeAction = vi.fn(async action => `ok:${action.tool}`)
    const planned = await planner.evaluate('await chat("hp=" + self.health)', actions, globals, executeAction)

    expect(planned.actions.map(a => a.action)).toEqual([{ tool: 'chat', params: { message: 'hp=20' } }])
  })

  it('rejects mixed skip + tool calls', async () => {
    const planner = new JavaScriptPlanner()
    const executeAction = vi.fn(async action => `ok:${action.tool}`)

    await expect(planner.evaluate('await skip(); await chat("oops")', actions, globals, executeAction)).rejects.toThrow(/skip\(\) cannot be mixed/i)
  })

  it('returns structured validation failures without aborting the script', async () => {
    const planner = new JavaScriptPlanner()
    const executeAction = vi.fn(async action => `ok:${action.tool}`)
    const planned = await planner.evaluate(`
      const first = await goToPlayer({ player_name: "Alex", closeness: -1 })
      if (!first.ok) {
        await chat("fallback")
      }
    `, actions, globals, executeAction)

    expect(planned.actions[0]?.ok).toBe(false)
    expect(planned.actions[0]?.error).toMatch(/Invalid tool parameters/i)
    expect(executeAction).toHaveBeenCalledTimes(1)
    expect(planned.actions[1]?.action.tool).toBe('chat')
  })

  it('enforces timeout on long-running scripts', async () => {
    const planner = new JavaScriptPlanner({ timeoutMs: 20 })
    const executeAction = vi.fn(async action => `ok:${action.tool}`)

    await expect(planner.evaluate('while (true) {}', actions, globals, executeAction)).rejects.toThrow(/Script execution timed out/i)
  })

  it('supports expectation guardrails on structured action telemetry', async () => {
    const planner = new JavaScriptPlanner()
    const executeAction = vi.fn(async () => ({
      ok: true,
      movedDistance: 1.25,
      distanceToTargetAfter: 1.5,
      endPos: { x: 8, y: 64, z: 4 },
    }))

    const planned = await planner.evaluate(`
      const nav = await goToPlayer({ player_name: "Alex", closeness: 2 })
      expect(nav.ok, "go failed")
      expectMoved(1)
      expectNear(2)
      expectNear({ x: 7, y: 64, z: 4 }, 2)
    `, actions, globals, executeAction)

    expect(planned.actions).toHaveLength(1)
    expect(planned.actions[0]?.ok).toBe(true)
  })

  it('throws when expectation guardrail fails', async () => {
    const planner = new JavaScriptPlanner()
    const executeAction = vi.fn(async () => ({
      ok: true,
      movedDistance: 0.1,
    }))

    await expect(planner.evaluate(`
      await goToPlayer({ player_name: "Alex", closeness: 2 })
      expectMoved(1, "did not move enough")
    `, actions, globals, executeAction)).rejects.toThrow(/Expectation failed: did not move enough/i)
  })

  it('describes registered globals for debug REPL', () => {
    const planner = new JavaScriptPlanner()
    const descriptors = planner.describeGlobals(actions, globals)
    const names = descriptors.map(d => d.name)

    expect(names).toContain('mem')
    expect(names).toContain('chat')
    expect(names).toContain('goToPlayer')
    expect(names).toContain('llmInput')
    expect(names).toContain('llmUserMessage')

    const mem = descriptors.find(d => d.name === 'mem')
    expect(mem?.readonly).toBe(false)
  })

  it('exposes llm input globals to scripts', async () => {
    const planner = new JavaScriptPlanner()
    const executeAction = vi.fn(async action => `ok:${action.tool}`)
    const planned = await planner.evaluate('await chat("llm=" + llmUserMessage)', actions, globals, executeAction)
    expect(planned.actions[0]?.action).toEqual({ tool: 'chat', params: { message: 'llm=latest user message' } })
  })

  it('detects expression-friendly REPL inputs', () => {
    const planner = new JavaScriptPlanner()
    expect(planner.canEvaluateAsExpression('2 + 3')).toBe(true)
    expect(planner.canEvaluateAsExpression('const a = 1; a + 1')).toBe(false)
  })
})
