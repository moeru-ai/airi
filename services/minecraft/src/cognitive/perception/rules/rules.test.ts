import { describe, expect, it } from 'vitest'

import {
  calculateWindowSlots,
  createAccumulatorState,
  parseWindowDuration,
  processEvent,
} from './accumulator'
import { parseRuleFromString } from './loader'
import {
  getNestedValue,
  matchCondition,
  matchEventType,
  matchWhere,
  renderTemplate,
} from './matcher'

describe('accumulator', () => {
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
    it('should increment count and not fire below threshold', () => {
      const state = createAccumulatorState(10)
      const [fired, newState] = processEvent(state, 5, Date.now())

      expect(fired).toBe(false)
      expect(newState.total).toBe(1)
    })

    it('should fire when threshold reached', () => {
      let state = createAccumulatorState(10)
      const now = Date.now()

      for (let i = 0; i < 4; i++) {
        const [fired, newState] = processEvent(state, 5, now)
        expect(fired).toBe(false)
        state = newState
      }

      const [fired, newState] = processEvent(state, 5, now)
      expect(fired).toBe(true)
      expect(newState.total).toBe(0) // Reset after fire
    })
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
accumulator:
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
      expect(rule.accumulator.threshold).toBe(5)
      expect(rule.accumulator.windowMs).toBe(2000)
      expect(rule.signal.type).toBe('entity_attention')
    })
  })
})
