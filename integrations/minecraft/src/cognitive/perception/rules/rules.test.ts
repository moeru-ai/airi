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

function buildArmSwingRuleYaml(
  mode: 'sliding' | 'tumbling',
  groupBy?: 'entityId' | 'global' | 'sourceId',
): string {
  const groupByYaml = groupBy ? `\n  groupBy: ${groupBy}` : ''

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
  mode: ${mode}${groupByYaml}
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

function createMockLogger() {
  const logger = {
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
    withError: vi.fn((_error?: Error) => logger),
    withFields: vi.fn((_fields?: Record<string, unknown>) => logger),
  }

  return logger
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
    config: {
      rulesDir,
      slotMs: 20,
    },
    eventBus,
    logger: logger as any,
  })
  const signals: TracedEvent[] = []
  const unsubscribe = eventBus.subscribe('signal:*', (event) => {
    signals.push(event)
  })

  engine.init()

  cleanupCallbacks.push(() => {
    unsubscribe()
    engine.destroy()
    fs.rmSync(rulesDir, { force: true, recursive: true })
  })

  return { engine, eventBus, logger, signals }
}

function emitArmSwingEvent(eventBus: EventBus, input: {
  displayName?: string
  entityId?: string
  sourceId?: string
  timestamp: number
}): void {
  const displayName = input.displayName ?? input.entityId ?? input.sourceId ?? 'unknown'
  const traceLabel = input.entityId ?? input.sourceId ?? 'global'

  eventBus.emit({
    payload: Object.freeze({
      displayName,
      distance: 3,
      entityId: input.entityId,
      entityType: 'player',
      hasLineOfSight: true,
      sourceId: input.sourceId,
      timestamp: input.timestamp,
    }),
    source: { component: 'test', id: 'rule-test' },
    traceId: `trace-${traceLabel}`,
    type: 'raw:sighted:arm_swing',
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
        mode: 'sliding',
        nowMs: 100,
        slotMs: 20,
        threshold: 2,
        windowMs: 1000,
      })
      expect(firstFired).toBe(false)
      state = stateAfterFirst

      const [secondFired, stateAfterSecond] = processEvent(state, {
        mode: 'sliding',
        nowMs: 200,
        slotMs: 20,
        threshold: 2,
        windowMs: 1000,
      })
      expect(secondFired).toBe(true)
      state = stateAfterSecond

      const [thirdFired, stateAfterThird] = processEvent(state, {
        mode: 'sliding',
        nowMs: 300,
        slotMs: 20,
        threshold: 2,
        windowMs: 1000,
      })
      expect(thirdFired).toBe(true)
      expect(stateAfterThird.total).toBe(3)
    })

    it('should treat sliding window as left-open and right-closed at the boundary', () => {
      let state = createDetectorState(10, 0)

      const [, stateAfterFirst] = processEvent(state, {
        mode: 'sliding',
        nowMs: 0,
        slotMs: 10,
        threshold: 2,
        windowMs: 100,
      })
      state = stateAfterFirst

      const [firedAt99, stateAfter99] = processEvent(state, {
        mode: 'sliding',
        nowMs: 99,
        slotMs: 10,
        threshold: 2,
        windowMs: 100,
      })
      expect(firedAt99).toBe(true)
      state = stateAfter99

      const [firedAt100] = processEvent(state, {
        mode: 'sliding',
        nowMs: 100,
        slotMs: 10,
        threshold: 3,
        windowMs: 100,
      })

      // Event at t=0 is out of window when t=100.
      expect(firedAt100).toBe(false)
    })

    it('should fire at most once per fixed window in tumbling mode', () => {
      let state = createDetectorState(1, 0)

      const [firstFired, stateAfterFirst] = processEvent(state, {
        mode: 'tumbling',
        nowMs: 100,
        threshold: 2,
        windowMs: 1000,
      })
      expect(firstFired).toBe(false)
      state = stateAfterFirst

      const [secondFired, stateAfterSecond] = processEvent(state, {
        mode: 'tumbling',
        nowMs: 200,
        threshold: 2,
        windowMs: 1000,
      })
      expect(secondFired).toBe(true)
      state = stateAfterSecond

      const [thirdFired, stateAfterThird] = processEvent(state, {
        mode: 'tumbling',
        nowMs: 300,
        threshold: 2,
        windowMs: 1000,
      })
      expect(thirdFired).toBe(false)
      state = stateAfterThird

      const [newWindowFirst, stateInNextWindow] = processEvent(state, {
        mode: 'tumbling',
        nowMs: 1000,
        threshold: 2,
        windowMs: 1000,
      })
      expect(newWindowFirst).toBe(false)
      state = stateInNextWindow

      const [newWindowSecond] = processEvent(state, {
        mode: 'tumbling',
        nowMs: 1200,
        threshold: 2,
        windowMs: 1000,
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

  it('should keep legacy fallback grouping when detector.groupBy is omitted', () => {
    const { engine, eventBus, signals } = createRuleEngineForTest(buildArmSwingRuleYaml('sliding'))

    emitArmSwingEvent(eventBus, { sourceId: 'source-a', timestamp: 100 })
    emitArmSwingEvent(eventBus, { sourceId: 'source-a', timestamp: 200 })

    expect(signals).toHaveLength(1)
    expect(engine.getDetectorDecisionSnapshot().map(item => item.groupKey)).toEqual([
      'source-a',
      'source-a',
    ])
  })

  it('should respect detector.groupBy sourceId when configured', () => {
    const { engine, eventBus, signals } = createRuleEngineForTest(buildArmSwingRuleYaml('sliding', 'sourceId'))

    emitArmSwingEvent(eventBus, { entityId: 'shared-entity', sourceId: 'source-a', timestamp: 100 })
    emitArmSwingEvent(eventBus, { entityId: 'shared-entity', sourceId: 'source-b', timestamp: 150 })
    expect(signals).toHaveLength(0)

    emitArmSwingEvent(eventBus, { entityId: 'shared-entity', sourceId: 'source-b', timestamp: 200 })
    emitArmSwingEvent(eventBus, { entityId: 'shared-entity', sourceId: 'source-a', timestamp: 250 })

    expect(signals).toHaveLength(2)
    const firedGroupKeys = engine.getDetectorDecisionSnapshot()
      .filter(item => item.decision === 'fired')
      .map(item => item.groupKey)
    expect(firedGroupKeys).toEqual(['source-b', 'source-a'])
  })

  it('should respect detector.groupBy global when configured', () => {
    const { engine, eventBus, signals } = createRuleEngineForTest(buildArmSwingRuleYaml('sliding', 'global'))

    emitArmSwingEvent(eventBus, { entityId: 'alice', timestamp: 100 })
    emitArmSwingEvent(eventBus, { entityId: 'bob', timestamp: 150 })

    expect(signals).toHaveLength(1)
    expect(engine.getDetectorDecisionSnapshot().map(item => item.groupKey)).toEqual([
      '__global__',
      '__global__',
    ])
  })

  it('should expose detector state as an immutable snapshot', () => {
    const { engine, eventBus } = createRuleEngineForTest(buildArmSwingRuleYaml('sliding'))

    emitArmSwingEvent(eventBus, { entityId: 'alice', timestamp: 100 })

    const stateKey = 'test-arm-swing-sliding::alice'
    const firstSnapshot = engine.getDetectorStates()
    expect(Object.isFrozen(firstSnapshot)).toBe(true)
    expect(firstSnapshot[stateKey]?.total).toBe(1)

    emitArmSwingEvent(eventBus, { entityId: 'alice', timestamp: 200 })

    const secondSnapshot = engine.getDetectorStates()
    expect(firstSnapshot).not.toBe(secondSnapshot)
    expect(firstSnapshot[stateKey]?.total).toBe(1)
    expect(secondSnapshot[stateKey]?.total).toBe(2)
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
        count: 1,
        decision: 'matched_not_fired',
        eventTs: 200,
        groupKey: 'alice',
        mode: 'sliding',
        ruleName: 'test-arm-swing-sliding',
        threshold: 2,
        windowMs: 1000,
      },
      {
        count: 1,
        decision: 'ignored_out_of_order',
        eventTs: 100,
        groupKey: 'alice',
        mode: 'sliding',
        ruleName: 'test-arm-swing-sliding',
        threshold: 2,
        windowMs: 1000,
      },
      {
        count: 2,
        decision: 'fired',
        eventTs: 250,
        groupKey: 'alice',
        mode: 'sliding',
        ruleName: 'test-arm-swing-sliding',
        threshold: 2,
        windowMs: 1000,
      },
    ])

    const decisionLogPayloads = logger.withFields.mock.calls
      .map(([fields]) => fields as undefined | { decision?: string })
      .filter((fields): fields is { decision: string } => Boolean(fields?.decision))

    expect(decisionLogPayloads).toEqual(expect.arrayContaining([
      expect.objectContaining({
        count: 1,
        decision: 'ignored_out_of_order',
        eventTs: 100,
        groupKey: 'alice',
        mode: 'sliding',
        ruleName: 'test-arm-swing-sliding',
        threshold: 2,
        windowMs: 1000,
      }),
      expect.objectContaining({
        count: 2,
        decision: 'fired',
        eventTs: 250,
        groupKey: 'alice',
        mode: 'sliding',
        ruleName: 'test-arm-swing-sliding',
        threshold: 2,
        windowMs: 1000,
      }),
    ]))
    expect(decisionLogPayloads.some(fields => fields.decision === 'matched_not_fired')).toBe(false)
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
      const where = { distance: { lt: 10 }, entityType: 'player' }
      const payload = { distance: 5, entityType: 'player' }

      expect(matchWhere(where, payload)).toBe(true)
    })

    it('should fail if any condition fails', () => {
      const where = { distance: { lt: 10 }, entityType: 'player' }
      const payload = { distance: 15, entityType: 'player' }

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
      const context = { message: 'Hello', name: 'Bob' }

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
      expect(rule.detector.groupBy).toBeUndefined()
      expect(rule.signal.type).toBe('entity_attention')
    })

    it('should parse explicit detector.groupBy', () => {
      const yaml = `
name: test-group-by
version: 1
trigger:
  modality: sighted
  kind: arm_swing
detector:
  threshold: 2
  window: 1s
  groupBy: sourceId
signal:
  type: entity_attention
  description: "Player {{ displayName }} is punching"
`
      const rule = parseRuleFromString(yaml)
      expect(rule.detector.groupBy).toBe('sourceId')
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
