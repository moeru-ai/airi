import type { EventBus, TracedEvent } from '../../event-bus'

import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { createEventBus } from '../../event-bus'
import { RuleEngine } from './engine'
import { parseRuleFromString } from './loader'
import {
  getNestedValue,
  matchCondition,
  matchEventType,
  matchWhere,
  renderTemplate,
} from './matcher'
import {
  calculateWindowSlots,
  createDetectorState,
  parseWindowDuration,
  processEvent,
} from './temporal-detector'

const cleanupCallbacks: Array<() => void> = []

afterEach(() => {
  while (cleanupCallbacks.length > 0) {
    const cleanup = cleanupCallbacks.pop()
    cleanup?.()
  }
})

function createMockLogger() {
  const logger = {
    withFields: vi.fn((_fields?: Record<string, unknown>) => logger),
    withError: vi.fn((_error?: Error) => logger),
    log: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }

  return logger
}

function buildArmSwingRuleYaml(mode: 'sliding' | 'tumbling'): string {
  return `
name: test-arm-swing-${mode}
version: 1
trigger:
  modality: sighted
  kind: arm_swing
  where:
    entityType: player
detector:
  threshold: 2
  window: 1s
  mode: ${mode}
signal:
  type: entity_attention
  description: "Player {{ displayName }} attention"
`
}

function buildArmSwingRuleYamlWithoutMode(): string {
  return `
name: test-arm-swing-default
version: 1
trigger:
  modality: sighted
  kind: arm_swing
  where:
    entityType: player
detector:
  threshold: 2
  window: 1s
signal:
  type: entity_attention
  description: "Player {{ displayName }} attention"
`
}

function createRuleEngineForTest(ruleYaml: string): {
  engine: RuleEngine
  eventBus: EventBus
  logger: ReturnType<typeof createMockLogger>
  signals: TracedEvent[]
} {
  const rulesDir = fs.mkdtempSync(path.join(os.tmpdir(), 'airi-rule-engine-test-'))
  fs.writeFileSync(path.join(rulesDir, 'test-rule.yaml'), ruleYaml, 'utf-8')

  const eventBus = createEventBus()
  const logger = createMockLogger()
  const engine = new RuleEngine({
    eventBus,
    logger: logger as any,
    config: {
      rulesDir,
      slotMs: 20,
    },
  })
  const signals: TracedEvent[] = []
  const unsubscribe = eventBus.subscribe('signal:*', (event) => {
    signals.push(event)
  })

  engine.init()

  cleanupCallbacks.push(() => {
    unsubscribe()
    engine.destroy()
    fs.rmSync(rulesDir, { recursive: true, force: true })
  })

  return { engine, eventBus, logger, signals }
}

function emitArmSwingEvent(eventBus: EventBus, input: {
  timestamp: number
  entityId: string
}): void {
  eventBus.emit({
    type: 'raw:sighted:arm_swing',
    payload: Object.freeze({
      timestamp: input.timestamp,
      entityType: 'player',
      entityId: input.entityId,
      displayName: input.entityId,
      distance: 3,
      hasLineOfSight: true,
    }),
    source: { component: 'test', id: 'rule-test' },
    traceId: `trace-${input.entityId}`,
  })
}

describe('detector', () => {
  describe('parseWindowDuration', () => {
    it('should parse milliseconds', () => {
      expect(parseWindowDuration('500ms')).toBe(500)
      expect(parseWindowDuration('100')).toBe(100)
    })

    it('should parse seconds', () => {
      expect(parseWindowDuration('2s')).toBe(2000)
      expect(parseWindowDuration('0.5s')).toBe(500)
    })

    it('should parse minutes', () => {
      expect(parseWindowDuration('1m')).toBe(60000)
    })
  })

  describe('calculateWindowSlots', () => {
    it('should calculate slots correctly', () => {
      expect(calculateWindowSlots(2000, 20)).toBe(100)
      expect(calculateWindowSlots(500, 20)).toBe(25)
    })
  })

  describe('processEvent', () => {
    it('should keep firing on every matched event after threshold in sliding mode', () => {
      let state = createDetectorState(50, 0)

      const [firstFired, stateAfterFirst] = processEvent(state, {
        threshold: 2,
        windowMs: 1000,
        mode: 'sliding',
        nowMs: 100,
        slotMs: 20,
      })
      expect(firstFired).toBe(false)
      state = stateAfterFirst

      const [secondFired, stateAfterSecond] = processEvent(state, {
        threshold: 2,
        windowMs: 1000,
        mode: 'sliding',
        nowMs: 200,
        slotMs: 20,
      })
      expect(secondFired).toBe(true)
      state = stateAfterSecond

      const [thirdFired, stateAfterThird] = processEvent(state, {
        threshold: 2,
        windowMs: 1000,
        mode: 'sliding',
        nowMs: 300,
        slotMs: 20,
      })
      expect(thirdFired).toBe(true)
      expect(stateAfterThird.total).toBe(3)
    })

    it('should treat sliding window as left-open and right-closed at the boundary', () => {
      let state = createDetectorState(10, 0)

      const [, stateAfterFirst] = processEvent(state, {
        threshold: 2,
        windowMs: 100,
        mode: 'sliding',
        nowMs: 0,
        slotMs: 10,
      })
      state = stateAfterFirst

      const [firedAt99, stateAfter99] = processEvent(state, {
        threshold: 2,
        windowMs: 100,
        mode: 'sliding',
        nowMs: 99,
        slotMs: 10,
      })
      expect(firedAt99).toBe(true)
      state = stateAfter99

      const [firedAt100] = processEvent(state, {
        threshold: 3,
        windowMs: 100,
        mode: 'sliding',
        nowMs: 100,
        slotMs: 10,
      })

      // Event at t=0 is out of window when t=100.
      expect(firedAt100).toBe(false)
    })

    it('should fire at most once per fixed window in tumbling mode', () => {
      let state = createDetectorState(1, 0)

      const [firstFired, stateAfterFirst] = processEvent(state, {
        threshold: 2,
        windowMs: 1000,
        mode: 'tumbling',
        nowMs: 100,
      })
      expect(firstFired).toBe(false)
      state = stateAfterFirst

      const [secondFired, stateAfterSecond] = processEvent(state, {
        threshold: 2,
        windowMs: 1000,
        mode: 'tumbling',
        nowMs: 200,
      })
      expect(secondFired).toBe(true)
      state = stateAfterSecond

      const [thirdFired, stateAfterThird] = processEvent(state, {
        threshold: 2,
        windowMs: 1000,
        mode: 'tumbling',
        nowMs: 300,
      })
      expect(thirdFired).toBe(false)
      state = stateAfterThird

      const [newWindowFirst, stateInNextWindow] = processEvent(state, {
        threshold: 2,
        windowMs: 1000,
        mode: 'tumbling',
        nowMs: 1000,
      })
      expect(newWindowFirst).toBe(false)
      state = stateInNextWindow

      const [newWindowSecond] = processEvent(state, {
        threshold: 2,
        windowMs: 1000,
        mode: 'tumbling',
        nowMs: 1200,
      })
      expect(newWindowSecond).toBe(true)
    })
  })
})

describe('engine temporal semantics', () => {
  it('should apply tumbling mode as once-per-window', () => {
    const { eventBus, signals } = createRuleEngineForTest(buildArmSwingRuleYaml('tumbling'))

    emitArmSwingEvent(eventBus, { entityId: 'alice', timestamp: 100 })
    emitArmSwingEvent(eventBus, { entityId: 'alice', timestamp: 200 })
    emitArmSwingEvent(eventBus, { entityId: 'alice', timestamp: 300 })
    expect(signals).toHaveLength(1)

    emitArmSwingEvent(eventBus, { entityId: 'alice', timestamp: 1100 })
    emitArmSwingEvent(eventBus, { entityId: 'alice', timestamp: 1200 })
    expect(signals).toHaveLength(2)
  })

  it('should apply sliding mode as every-match', () => {
    const { eventBus, signals } = createRuleEngineForTest(buildArmSwingRuleYaml('sliding'))

    emitArmSwingEvent(eventBus, { entityId: 'alice', timestamp: 100 })
    emitArmSwingEvent(eventBus, { entityId: 'alice', timestamp: 200 })
    emitArmSwingEvent(eventBus, { entityId: 'alice', timestamp: 300 })

    expect(signals).toHaveLength(2)
  })

  it('should isolate detectors by default group key (entityId/sourceId)', () => {
    const { eventBus, signals } = createRuleEngineForTest(buildArmSwingRuleYaml('sliding'))

    emitArmSwingEvent(eventBus, { entityId: 'alice', timestamp: 100 })
    emitArmSwingEvent(eventBus, { entityId: 'bob', timestamp: 150 })
    expect(signals).toHaveLength(0)

    emitArmSwingEvent(eventBus, { entityId: 'bob', timestamp: 200 })
    emitArmSwingEvent(eventBus, { entityId: 'alice', timestamp: 250 })
    expect(signals).toHaveLength(2)

    const sourceIds = signals.map(event => (event.payload as { sourceId?: unknown }).sourceId)
    expect(sourceIds).toEqual(['bob', 'alice'])
  })

  it('should ignore out-of-order timestamps to keep temporal detection deterministic', () => {
    const { engine, eventBus, logger, signals } = createRuleEngineForTest(buildArmSwingRuleYaml('sliding'))

    emitArmSwingEvent(eventBus, { entityId: 'alice', timestamp: 200 })
    emitArmSwingEvent(eventBus, { entityId: 'alice', timestamp: 100 })
    emitArmSwingEvent(eventBus, { entityId: 'alice', timestamp: 250 })

    expect(signals).toHaveLength(1)
    expect(logger.warn).toHaveBeenCalledTimes(1)

    expect(engine.getDetectorDecisionSnapshot()).toEqual([
      {
        ruleName: 'test-arm-swing-sliding',
        mode: 'sliding',
        groupKey: 'alice',
        count: 1,
        threshold: 2,
        windowMs: 1000,
        eventTs: 200,
        decision: 'matched_not_fired',
      },
      {
        ruleName: 'test-arm-swing-sliding',
        mode: 'sliding',
        groupKey: 'alice',
        count: 1,
        threshold: 2,
        windowMs: 1000,
        eventTs: 100,
        decision: 'ignored_out_of_order',
      },
      {
        ruleName: 'test-arm-swing-sliding',
        mode: 'sliding',
        groupKey: 'alice',
        count: 2,
        threshold: 2,
        windowMs: 1000,
        eventTs: 250,
        decision: 'fired',
      },
    ])

    const decisionLogPayloads = logger.withFields.mock.calls
      .map(([fields]) => fields as { decision?: string } | undefined)
      .filter((fields): fields is { decision: string } => Boolean(fields?.decision))

    expect(decisionLogPayloads).toEqual(expect.arrayContaining([
      expect.objectContaining({
        ruleName: 'test-arm-swing-sliding',
        mode: 'sliding',
        groupKey: 'alice',
        count: 1,
        threshold: 2,
        windowMs: 1000,
        eventTs: 100,
        decision: 'ignored_out_of_order',
      }),
      expect.objectContaining({
        ruleName: 'test-arm-swing-sliding',
        mode: 'sliding',
        groupKey: 'alice',
        count: 2,
        threshold: 2,
        windowMs: 1000,
        eventTs: 250,
        decision: 'fired',
      }),
    ]))
  })

  it('should default detector mode to sliding when mode is omitted', () => {
    const { engine, eventBus, signals } = createRuleEngineForTest(buildArmSwingRuleYamlWithoutMode())

    emitArmSwingEvent(eventBus, { entityId: 'alice', timestamp: 100 })
    emitArmSwingEvent(eventBus, { entityId: 'alice', timestamp: 200 })
    emitArmSwingEvent(eventBus, { entityId: 'alice', timestamp: 300 })

    expect(signals).toHaveLength(2)
    expect(engine.getDetectorDecisionSnapshot().map(item => item.decision)).toEqual([
      'matched_not_fired',
      'fired',
      'fired',
    ])
    expect(engine.getDetectorDecisionSnapshot().map(item => item.mode)).toEqual([
      'sliding',
      'sliding',
      'sliding',
    ])
  })
})

describe('matcher', () => {
  describe('matchCondition', () => {
    it('should match direct values', () => {
      expect(matchCondition('player', 'player')).toBe(true)
      expect(matchCondition(10, 10)).toBe(true)
      expect(matchCondition(true, true)).toBe(true)
    })

    it('should match operators', () => {
      expect(matchCondition({ lt: 10 }, 5)).toBe(true)
      expect(matchCondition({ lt: 10 }, 15)).toBe(false)
      expect(matchCondition({ gte: 5 }, 5)).toBe(true)
      expect(matchCondition({ in: ['a', 'b'] }, 'a')).toBe(true)
    })
  })

  describe('matchWhere', () => {
    it('should match all conditions', () => {
      const where = { entityType: 'player', distance: { lt: 10 } }
      const payload = { entityType: 'player', distance: 5 }

      expect(matchWhere(where, payload)).toBe(true)
    })

    it('should fail if any condition fails', () => {
      const where = { entityType: 'player', distance: { lt: 10 } }
      const payload = { entityType: 'player', distance: 15 }

      expect(matchWhere(where, payload)).toBe(false)
    })
  })

  describe('matchEventType', () => {
    it('should match exact types', () => {
      expect(matchEventType('raw:sighted:punch', 'raw:sighted:punch')).toBe(true)
    })

    it('should match wildcards', () => {
      expect(matchEventType('raw:*', 'raw:sighted:punch')).toBe(true)
      expect(matchEventType('raw:sighted:*', 'raw:sighted:punch')).toBe(true)
      expect(matchEventType('signal:*', 'raw:sighted:punch')).toBe(false)
    })
  })

  describe('renderTemplate', () => {
    it('should replace placeholders', () => {
      const template = 'Player {{ name }} says {{ message }}'
      const context = { name: 'Bob', message: 'Hello' }

      expect(renderTemplate(template, context)).toBe('Player Bob says Hello')
    })

    it('should keep unknown placeholders', () => {
      const template = 'Hello {{ unknown }}'
      expect(renderTemplate(template, {})).toBe('Hello {{unknown}}')
    })
  })

  describe('getNestedValue', () => {
    it('should get nested values', () => {
      const obj = { a: { b: { c: 42 } } }
      expect(getNestedValue(obj, 'a.b.c')).toBe(42)
    })
  })
})

describe('loader', () => {
  describe('parseRuleFromString', () => {
    it('should parse a valid YAML rule', () => {
      const yaml = `
name: test-rule
version: 1
trigger:
  modality: sighted
  kind: arm_swing
  where:
    entityType: player
detector:
  threshold: 5
  window: 2s
signal:
  type: entity_attention
  description: "Player {{ displayName }} is punching"
`
      const rule = parseRuleFromString(yaml)

      expect(rule.name).toBe('test-rule')
      expect(rule.version).toBe(1)
      expect(rule.trigger.eventType).toBe('raw:sighted:arm_swing')
      expect(rule.trigger.where).toEqual({ entityType: 'player' })
      expect(rule.detector.threshold).toBe(5)
      expect(rule.detector.windowMs).toBe(2000)
      expect(rule.detector.mode).toBe('sliding')
      expect(rule.signal.type).toBe('entity_attention')
    })

    it('should reject invalid detector threshold and confidence', () => {
      const yaml = `
name: invalid-threshold
trigger:
  modality: sighted
  kind: arm_swing
detector:
  threshold: 0
  window: 2s
signal:
  type: entity_attention
  description: "Player {{ displayName }} is punching"
  confidence: 1.5
`

      expect(() => parseRuleFromString(yaml)).toThrowErrorMatchingInlineSnapshot(`
        [Error: Invalid rule in <string>:
        - detector.threshold: Too small: expected number to be >0
        - signal.confidence: Too big: expected number to be <=1]
      `)
    })

    it('should reject invalid where operator shape', () => {
      const yaml = `
name: invalid-where
trigger:
  modality: sighted
  kind: arm_swing
  where:
    distance:
      lt: 10
      gt: 2
detector:
  threshold: 1
  window: 2s
signal:
  type: entity_attention
  description: "Player {{ displayName }} is punching"
`

      expect(() => parseRuleFromString(yaml)).toThrowErrorMatchingInlineSnapshot(`
        [Error: Invalid rule in <string>:
        - trigger.where.distance: Invalid input]
      `)
    })

    it('should reject invalid signal metadata values', () => {
      const yaml = `
name: invalid-metadata
trigger:
  modality: system
  kind: system_message
detector:
  threshold: 1
  window: 1s
signal:
  type: system_message
  description: "{{ message }}"
  metadata:
    nested:
      foo: bar
`

      expect(() => parseRuleFromString(yaml)).toThrowErrorMatchingInlineSnapshot(`
        [Error: Invalid rule in <string>:
        - signal.metadata.nested: Invalid input]
      `)
    })

    it('should reject bare null where literals', () => {
      const yaml = `
name: invalid-null-where
trigger:
  modality: sighted
  kind: arm_swing
  where:
    target: null
detector:
  threshold: 1
  window: 1s
signal:
  type: entity_attention
  description: "Player {{ displayName }} is punching"
`

      expect(() => parseRuleFromString(yaml)).toThrowErrorMatchingInlineSnapshot(`
        [Error: Invalid rule in <string>:
        - trigger.where.target: Invalid input]
      `)
    })
  })
})
