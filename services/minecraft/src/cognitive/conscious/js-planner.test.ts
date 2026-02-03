import type { Action } from '../../libs/mineflayer/action'

import { describe, expect, it } from 'vitest'
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

describe('JavaScriptPlanner', () => {
  it('maps positional and object tool args into validated action instructions', () => {
    const planner = new JavaScriptPlanner()
    const planned = planner.evaluate(`
      chat("hello")
      goToPlayer({ player_name: "Alex", closeness: 2 })
    `, actions)

    expect(planned).toEqual([
      { tool: 'chat', params: { message: 'hello' } },
      { tool: 'goToPlayer', params: { player_name: 'Alex', closeness: 2 } },
    ])
  })

  it('supports dynamic dispatch with use(toolName, params)', () => {
    const planner = new JavaScriptPlanner()
    const planned = planner.evaluate(`use("chat", { message: "via-use" })`, actions)

    expect(planned).toEqual([{ tool: 'chat', params: { message: 'via-use' } }])
  })

  it('persists script variables across turns', () => {
    const planner = new JavaScriptPlanner()

    planner.evaluate('const count = 2', actions)
    const planned = planner.evaluate('chat("count=" + count)', actions)

    expect(planned).toEqual([{ tool: 'chat', params: { message: 'count=2' } }])
  })

  it('returns skip when no tool is called', () => {
    const planner = new JavaScriptPlanner()
    const planned = planner.evaluate('const x = 1 + 1', actions)

    expect(planned).toEqual([{ tool: 'skip', params: {} }])
  })

  it('rejects mixed skip + tool calls', () => {
    const planner = new JavaScriptPlanner()

    expect(() => planner.evaluate('skip(); chat("oops")', actions)).toThrow(/skip\(\) cannot be mixed/i)
  })

  it('enforces timeout on long-running scripts', () => {
    const planner = new JavaScriptPlanner({ timeoutMs: 20 })

    expect(() => planner.evaluate('while (true) {}', actions)).toThrow(/Script execution timed out/i)
  })
})
