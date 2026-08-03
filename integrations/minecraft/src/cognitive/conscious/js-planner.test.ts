// NOTICE: fixtures below are string literals that REPRESENT bot code containing
// template literals (e.g. `我有 ${n} 颗钻石`). The `${...}` is intentional test
// data, not a mistaken template string, so disable no-template-curly-in-string here.
/* eslint-disable no-template-curly-in-string */
import type { Action } from '../../libs/mineflayer/action'

import { Vec3 } from 'vec3'
import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

import { extractJavaScriptCandidate, JavaScriptPlanner } from './js-planner'

describe('extractJavaScriptCandidate', () => {
  it('takes the inner code of a fenced block, leaving template literals intact', () => {
    const reply = '好的主人:\n```js\nconst n = query.inventory().count("diamond")\nawait chat({ message: `我有 ${n} 颗钻石~` })\n```\n这样就安全了!'
    expect(extractJavaScriptCandidate(reply)).toBe('const n = query.inventory().count("diamond")\nawait chat({ message: `我有 ${n} 颗钻石~` })')
  })

  it('returns clean code unchanged', () => {
    const code = 'const n = 5\nawait chat({ message: `我有 ${n} 颗钻石` })'
    expect(extractJavaScriptCandidate(code)).toBe(code)
  })

  it('salvages code when the model adds trailing prose without a fence', () => {
    const reply = 'await chat({ message: "好的主人" })\n然后我去做盔甲'
    expect(extractJavaScriptCandidate(reply)).toBe('await chat({ message: "好的主人" })')
  })

  it('salvages code when the model adds a leading prose line without a fence', () => {
    const reply = '好的,我来做:\nawait craftRecipe({ item_name: "diamond_helmet" })'
    expect(extractJavaScriptCandidate(reply)).toBe('await craftRecipe({ item_name: "diamond_helmet" })')
  })

  it('leaves pure prose untouched (nothing executable to salvage)', () => {
    const reply = '我来给自己做钻石盔甲保护一下。'
    expect(extractJavaScriptCandidate(reply)).toBe(reply)
  })
})

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

const actionsWithSkip: Action[] = [
  createAction('skip', z.object({})),
  ...actions,
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
    patterns: {
      get: (id: string) => {
        if (id !== 'collect.wall_torch')
          return null
        return {
          id: 'collect.wall_torch',
          title: 'Collect Wall Torches Reliably',
          intent: 'Use variant-aware block lookup for torch tasks.',
          whenToUse: ['torch tasks'],
          steps: ['scan blocks', 'mine exact target'],
          code: 'const target = query.blocks().within(32).list().find(b => b.name.includes("torch"));',
          tags: ['torch', 'wall_torch'],
        }
      },
      find: (query: string, limit = 10) => {
        if (!query.toLowerCase().includes('torch'))
          return []
        return [{
          id: 'collect.wall_torch',
          title: 'Collect Wall Torches Reliably',
          intent: 'Use variant-aware block lookup for torch tasks.',
          whenToUse: ['torch tasks'],
          steps: ['scan blocks', 'mine exact target'],
          code: 'const target = query.blocks().within(32).list().find(b => b.name.includes("torch"));',
          tags: ['torch', 'wall_torch'],
        }].slice(0, limit)
      },
      ids: () => ['collect.wall_torch'],
      list: (limit = 10) => [{
        id: 'collect.wall_torch',
        title: 'Collect Wall Torches Reliably',
        intent: 'Use variant-aware block lookup for torch tasks.',
        whenToUse: ['torch tasks'],
        steps: ['scan blocks', 'mine exact target'],
        code: 'const target = query.blocks().within(32).list().find(b => b.name.includes("torch"));',
        tags: ['torch', 'wall_torch'],
      }].slice(0, limit),
    },
    actionQueue: {
      executing: null,
      pending: [],
      recent: [],
      capacity: { total: 5, executing: 1, pending: 4 },
      counts: { total: 0, executing: 0, pending: 0 },
      updatedAt: Date.now(),
    },
    noActionBudget: {
      remaining: 3,
      default: 3,
      max: 8,
    },
    errorBurstGuard: null,
    setNoActionBudget: (value: number) => ({
      ok: true,
      remaining: Math.max(0, Math.min(8, Math.floor(value))),
      default: 3,
      max: 8,
    }),
    getNoActionBudget: () => ({
      remaining: 3,
      default: 3,
      max: 8,
    }),
    forgetConversation: () => ({ ok: true, cleared: ['conversationHistory', 'lastLlmInputSnapshot'] }),
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

  // https://github.com/moeru-ai/airi/pull/1915 (Codex P2)
  it('exposes self.pos / self.position as aliases of self.location in the sandbox', async () => {
    // ROOT CAUSE:
    // The prompt promises self.pos.x, but the worker bound `self` straight from the reflex snapshot
    // (only `.location`), so self.pos / self.position were undefined and scripts crashed with
    // "Cannot read properties of undefined". buildRuntimeSnapshot now aliases pos/position -> location
    // on the isolate snapshot the worker binds from. Earlier the alias only reached the debug preview.
    const planner = new JavaScriptPlanner()
    const executeAction = vi.fn(async action => `ok:${action.tool}`)
    const withSelf = {
      ...globals,
      snapshot: { ...globals.snapshot, self: { health: 20, food: 20, location: { x: 12, y: 64, z: -7 } } },
    }

    const planned = await planner.evaluate(
      'return self.pos.x + "," + self.position.z + "," + self.location.y',
      actions,
      withSelf as any,
      executeAction,
    )

    expect(planned.returnValue).toContain('12,-7,64')
  })

  it('persists typed previous return via prevRun.returnRaw', async () => {
    const planner = new JavaScriptPlanner()
    const executeAction = vi.fn(async action => `ok:${action.tool}`)

    await planner.evaluate(`
      const inv = [{ name: "oak_log", count: 2 }]
      return inv
    `, actions, globals, executeAction)

    const planned = await planner.evaluate(`
      const inv = prevRun.returnRaw
      await chat(inv.map(item => item.count + " " + item.name).join(", "))
    `, actions, globals, executeAction)

    expect(planned.actions.map(a => a.action)).toEqual([{ tool: 'chat', params: { message: '2 oak_log' } }])
  })

  it('does not expose stringified return mirror on prevRun', async () => {
    const planner = new JavaScriptPlanner()
    const executeAction = vi.fn(async action => `ok:${action.tool}`)

    await planner.evaluate(`
      const inv = [{ name: "oak_log", count: 2 }]
      return inv
    `, actions, globals, executeAction)

    const planned = await planner.evaluate('return Object.prototype.hasOwnProperty.call(prevRun, "returnValue")', actions, globals, executeAction)
    expect(planned.returnValue).toBe('false')
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

  it('allows evaluate when action catalog also includes skip', async () => {
    const planner = new JavaScriptPlanner()
    const executeAction = vi.fn(async action => `ok:${action.tool}`)

    await expect(planner.evaluate('await skip()', actionsWithSkip, globals, executeAction)).resolves.toMatchObject({
      actions: [
        {
          action: { tool: 'skip', params: {} },
          ok: true,
          result: 'Skipped turn',
        },
      ],
    })
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
    expect(names).toContain('query')
    expect(names).toContain('patterns')
    expect(names).toContain('patterns.get')
    expect(names).toContain('patterns.find')
    expect(names).toContain('bot')
    expect(names).toContain('mineflayer')
    expect(names).toContain('currentInput')
    expect(names).toContain('llmLog')
    expect(names).toContain('actionQueue')
    expect(names).toContain('noActionBudget')
    expect(names).toContain('errorBurstGuard')
    expect(names).toContain('setNoActionBudget')
    expect(names).toContain('getNoActionBudget')
    expect(names).toContain('forget_conversation')

    const mem = descriptors.find(d => d.name === 'mem')
    expect(mem?.readonly).toBe(false)
  })

  it('exposes actionQueue runtime global to scripts', async () => {
    const planner = new JavaScriptPlanner()
    const executeAction = vi.fn(async action => `ok:${action.tool}`)
    const planned = await planner.evaluate('return actionQueue.capacity.total', actions, globals, executeAction)
    expect(planned.returnValue).toBe('5')
    expect(planned.actions).toHaveLength(0)
  })

  it('exposes no-action budget runtime globals to scripts', async () => {
    const planner = new JavaScriptPlanner()
    const executeAction = vi.fn(async action => `ok:${action.tool}`)
    const planned = await planner.evaluate('return { state: getNoActionBudget(), set: setNoActionBudget(6), now: noActionBudget }', actions, globals, executeAction)
    expect(planned.returnValue).toContain('remaining: 3')
    expect(planned.returnValue).toContain('remaining: 6')
    expect(planned.actions).toHaveLength(0)
  })

  it('exposes error-burst guard runtime global to scripts', async () => {
    const planner = new JavaScriptPlanner()
    const executeAction = vi.fn(async action => `ok:${action.tool}`)
    const guardedGlobals = {
      ...globals,
      errorBurstGuard: {
        threshold: 3,
        windowTurns: 5,
        errorTurnCount: 3,
      },
    } as any
    const planned = await planner.evaluate('return errorBurstGuard.errorTurnCount', actions, guardedGlobals, executeAction)
    expect(planned.returnValue).toBe('3')
    expect(planned.actions).toHaveLength(0)
  })

  it('exposes llm input globals to scripts', async () => {
    const planner = new JavaScriptPlanner()
    const executeAction = vi.fn(async action => `ok:${action.tool}`)
    const planned = await planner.evaluate('await chat("llm=" + llmUserMessage)', actions, globals, executeAction)
    expect(planned.actions[0]?.action).toEqual({ tool: 'chat', params: { message: 'llm=latest user message' } })
  })

  it('exposes patterns runtime global to scripts', async () => {
    const planner = new JavaScriptPlanner()
    const executeAction = vi.fn(async action => `ok:${action.tool}`)

    const fromGet = await planner.evaluate('return patterns.get("collect.wall_torch")?.id', actions, globals, executeAction)
    expect(fromGet.returnValue).toContain('collect.wall_torch')

    const fromFind = await planner.evaluate('return patterns.find("torch wall", 1).map(p => p.id)', actions, globals, executeAction)
    expect(fromFind.returnValue).toContain('collect.wall_torch')
  })

  it('exposes forget_conversation runtime function', async () => {
    const planner = new JavaScriptPlanner()
    const executeAction = vi.fn(async action => `ok:${action.tool}`)
    const planned = await planner.evaluate('return forget_conversation()', actions, globals, executeAction)

    expect(planned.returnValue).toContain('conversationHistory')
    expect(planned.actions).toHaveLength(0)
  })

  it('bridges AIRI notification callbacks through the isolate', async () => {
    const planner = new JavaScriptPlanner()
    const executeAction = vi.fn(async action => `ok:${action.tool}`)
    const notifyAiri = vi.fn()
    const updateAiriContext = vi.fn()

    const planned = await planner.evaluate(`
      notifyAiri('Need help', 'Low health', 'immediate')
      updateAiriContext('Shelter built', ['shelter', 'spawn'], 'memory')
      return 'ok'
    `, actions, {
      ...globals,
      notifyAiri,
      updateAiriContext,
    } as any, executeAction)

    expect(planned.returnValue).toBe('\'ok\'')
    expect(notifyAiri).toHaveBeenCalledWith('Need help', 'Low health', 'immediate')
    expect(updateAiriContext).toHaveBeenCalledWith('Shelter built', ['shelter', 'spawn'], 'memory')
  })

  it('does not leak sandbox bridge handles into user scope', async () => {
    const planner = new JavaScriptPlanner()
    const executeAction = vi.fn(async action => `ok:${action.tool}`)
    const planned = await planner.evaluate(`
      return {
        bridge: typeof __plannerBridge,
        bridgeRef: typeof __plannerBridgeRef,
        availability: typeof __plannerAvailability,
        logRef: typeof __plannerLogRef,
        queryMap: typeof __plannerQueryMap,
      }
    `, actions, globals, executeAction)

    expect(planned.returnValue).toContain('bridge: \'undefined\'')
    expect(planned.returnValue).toContain('bridgeRef: \'undefined\'')
    expect(planned.returnValue).toContain('availability: \'undefined\'')
    expect(planned.returnValue).toContain('logRef: \'undefined\'')
    expect(planned.returnValue).toContain('queryMap: \'undefined\'')
  })

  it('fails closed when a host bridge call never resolves', async () => {
    const planner = new JavaScriptPlanner({ bridgeTimeoutMs: 40 })
    const executeAction = vi.fn(async () => await new Promise(() => {}))

    await expect(planner.evaluate('await chat("hello")', actions, globals, executeAction)).rejects.toThrow(/Sandbox bridge timed out/i)
  })

  it('does not expose host process globals inside the isolate', async () => {
    const planner = new JavaScriptPlanner()
    const executeAction = vi.fn(async action => `ok:${action.tool}`)
    const planned = await planner.evaluate('return { process: typeof process, require: typeof require, escaped: Function("return typeof process")() }', actions, globals, executeAction)

    expect(planned.returnValue).toContain('process: \'undefined\'')
    expect(planned.returnValue).toContain('require: \'undefined\'')
    expect(planned.returnValue).toContain('escaped: \'undefined\'')
  })

  it('renders nested return objects without [Object] truncation', async () => {
    const planner = new JavaScriptPlanner()
    const executeAction = vi.fn(async action => `ok:${action.tool}`)
    const planned = await planner.evaluate(`
      return {
        nearbyCopperOre: [{
          name: 'copper_ore',
          pos: { x: 10, y: 64, z: -2 },
          distance: 1.8,
        }],
      }
    `, actions, globals, executeAction)

    expect(planned.returnValue).toContain('pos: { x: 10, y: 64, z: -2 }')
    expect(planned.returnValue).not.toContain('[Object]')
  })

  it('detects expression-friendly REPL inputs', () => {
    const planner = new JavaScriptPlanner()
    expect(planner.canEvaluateAsExpression('2 + 3')).toBe(true)
    expect(planner.canEvaluateAsExpression('const a = 1; a + 1')).toBe(false)
  })

  it('botCall invokes the named bot method with a marshaled Vec3 position arg', async () => {
    const planner = new JavaScriptPlanner()
    const lookAt = vi.fn<(pos: unknown, force: unknown) => Promise<void>>(async () => undefined)
    const globalsWithBot = { ...globals, mineflayer: { bot: { lookAt } } } as any
    const executeAction = vi.fn(async action => `ok:${action.tool}`)

    await planner.evaluate('await botCall("lookAt", [{ x: 1, y: 2, z: 3 }, true])', actions, globalsWithBot, executeAction)

    expect(lookAt).toHaveBeenCalledTimes(1)
    const [posArg, forceArg] = lookAt.mock.calls[0]
    expect(posArg).toBeInstanceOf(Vec3)
    expect(posArg).toMatchObject({ x: 1, y: 2, z: 3 })
    expect(forceArg).toBe(true)
  })

  it('botCall rejects a denylisted bot method', async () => {
    const planner = new JavaScriptPlanner()
    const end = vi.fn()
    const globalsWithBot = { ...globals, mineflayer: { bot: { end } } } as any
    const executeAction = vi.fn(async action => `ok:${action.tool}`)

    await expect(
      planner.evaluate('await botCall("end", [])', actions, globalsWithBot, executeAction),
    ).rejects.toThrow(/not allowed/i)
    expect(end).not.toHaveBeenCalled()
  })

  it('query.entities().whereName filters nearby entities by name in the sandbox', async () => {
    const planner = new JavaScriptPlanner()
    const mineflayer = {
      bot: {
        version: '1.21.1',
        entity: { id: 0, position: { x: 0, y: 64, z: 0 } },
        health: 20,
        food: 20,
        heldItem: null,
        game: { gameMode: 'survival' },
        isRaining: false,
        time: { timeOfDay: 0 },
        entities: {
          1: { id: 1, name: 'dssadg', type: 'player', username: 'dssadg', position: { x: 3, y: 64, z: 0 } },
        },
        players: {},
        findBlocks: () => [],
        blockAt: () => null,
        inventory: { items: () => [], emptySlotCount: () => 36 },
        registry: { items: {}, itemsByName: {}, blocksByName: { crafting_table: { id: 58 } } },
        recipesFor: () => [],
      },
    }
    const executeAction = vi.fn(async action => `ok:${action.tool}`)

    const planned = await planner.evaluate(
      'const e = query.entities().whereName("dssadg").first(); return e ? e.name : "none"',
      actions,
      { ...globals, mineflayer } as any,
      executeAction,
    )

    expect(planned.returnValue).toContain('dssadg')
  })

  // https://github.com/moeru-ai/airi/pull/1915 (Codex P2)
  it('query.entities().whereType("player") still matches players after name is projected to username', async () => {
    // ROOT CAUSE:
    // Player records now expose `name` = username (e.g. "dssadg"), but the sandbox whereType()
    // predicate only checked `entity.name ?? entity.type`, so whereType("player") computed "dssadg"
    // and matched nothing. The TS EntityQueryChain was fixed to also check `entity.type`; the
    // sandbox runtime must mirror it. Before the fix this returned "none".
    const planner = new JavaScriptPlanner()
    const mineflayer = {
      bot: {
        version: '1.21.1',
        entity: { id: 0, position: { x: 0, y: 64, z: 0 } },
        health: 20,
        food: 20,
        heldItem: null,
        game: { gameMode: 'survival' },
        isRaining: false,
        time: { timeOfDay: 0 },
        entities: {
          1: { id: 1, name: 'dssadg', type: 'player', username: 'dssadg', position: { x: 3, y: 64, z: 0 } },
        },
        players: {},
        findBlocks: () => [],
        blockAt: () => null,
        inventory: { items: () => [], emptySlotCount: () => 36 },
        registry: { items: {}, itemsByName: {}, blocksByName: { crafting_table: { id: 58 } } },
        recipesFor: () => [],
      },
    }
    const executeAction = vi.fn(async action => `ok:${action.tool}`)

    const planned = await planner.evaluate(
      'const e = query.entities().whereType("player").first(); return e ? e.name : "none"',
      actions,
      { ...globals, mineflayer } as any,
      executeAction,
    )

    expect(planned.returnValue).toContain('dssadg')
  })
})
