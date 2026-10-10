import type { HomeAssistantEntity } from './client'
import type { HomeAssistantExposure } from './exposure'

import { describe, expect, it } from 'vitest'

import { allEntitiesExposure, assertEntityExposed, describeExposure, describeHidden, filterExposed, isEntityExposed, isExposureMode } from './exposure'

const entity = (entityId: string): HomeAssistantEntity => ({ entityId, state: 'on', attributes: {} })

/** Builds a narrow policy, so a test reads as the choice the user made. */
const allow = (...entityIds: string[]): HomeAssistantExposure => ({ mode: 'allow', entityIds })
const deny = (...entityIds: string[]): HomeAssistantExposure => ({ mode: 'deny', entityIds })

const home: HomeAssistantEntity[] = [
  entity('light.kitchen'),
  entity('light.hall'),
  entity('lock.front_door'),
]

describe('isEntityExposed', () => {
  it('accepts every entity under "all"', () => {
    expect(isEntityExposed(allEntitiesExposure, 'lock.front_door')).toBe(true)
  })

  it('accepts only the listed entities under "allow"', () => {
    expect(isEntityExposed(allow('light.kitchen'), 'light.kitchen')).toBe(true)
    expect(isEntityExposed(allow('light.kitchen'), 'light.hall')).toBe(false)
  })

  it('accepts everything except the listed entities under "deny"', () => {
    expect(isEntityExposed(deny('lock.front_door'), 'lock.front_door')).toBe(false)
    expect(isEntityExposed(deny('lock.front_door'), 'light.kitchen')).toBe(true)
  })

  it('accepts nothing under an empty allow list', () => {
    expect(isEntityExposed(allow(), 'light.kitchen')).toBe(false)
  })

  it('blocks nothing under an empty deny list', () => {
    // A user who opens the block list and picks nothing blocks nothing.
    expect(isEntityExposed(deny(), 'light.kitchen')).toBe(true)
  })

  it('reads the entity, not its domain', () => {
    // Two lights share a domain. One can be reachable while the other is not.
    const exposure = allow('light.kitchen')

    expect(isEntityExposed(exposure, 'light.kitchen')).toBe(true)
    expect(isEntityExposed(exposure, 'light.hall')).toBe(false)
  })
})

describe('filterExposed', () => {
  it('keeps the listed entities under "allow"', () => {
    expect(filterExposed(allow('light.kitchen'), home).map(entry => entry.entityId))
      .toEqual(['light.kitchen'])
  })

  it('drops the listed entities under "deny"', () => {
    expect(filterExposed(deny('lock.front_door'), home).map(entry => entry.entityId))
      .toEqual(['light.kitchen', 'light.hall'])
  })

  it('keeps every entity under "all"', () => {
    expect(filterExposed(allEntitiesExposure, home)).toHaveLength(3)
  })
})

describe('assertEntityExposed', () => {
  it('names the entity and the allow list that excludes it', () => {
    // The model reads this message, so it must name the device to ask about.
    expect(() => assertEntityExposed(allow('light.kitchen'), 'lock.front_door'))
      .toThrow('Entity "lock.front_door" is not available. The user allows only chosen devices')
  })

  it('names the blocked device under "deny"', () => {
    expect(() => assertEntityExposed(deny('lock.front_door'), 'lock.front_door'))
      .toThrow('The user blocks this device')
  })

  it('passes an exposed entity in both list modes', () => {
    expect(() => assertEntityExposed(allow('light.kitchen'), 'light.kitchen')).not.toThrow()
    expect(() => assertEntityExposed(deny('lock.front_door'), 'light.kitchen')).not.toThrow()
  })

  it('rejects every entity under an empty allow list', () => {
    expect(() => assertEntityExposed(allow(), 'light.kitchen')).toThrow()
  })
})

describe('describeHidden', () => {
  it('says nothing when the list hides nothing', () => {
    expect(describeHidden(allEntitiesExposure, 0)).toBe('')
    expect(describeHidden(deny('lock.front_door'), 0)).toBe('')
  })

  it('names the allow list on the count it hides', () => {
    expect(describeHidden(allow('light.kitchen'), 2)).toBe('2 entities are not on the user\'s allow list.')
    expect(describeHidden(allow('light.kitchen'), 1)).toBe('1 entity is not on the user\'s allow list.')
  })

  it('names the blocked list on the count it hides', () => {
    expect(describeHidden(deny('lock.front_door'), 117)).toBe('117 entities are on the user\'s blocked list.')
  })
})

describe('describeExposure', () => {
  it('states that every device is reachable', () => {
    expect(describeExposure(allEntitiesExposure)).toBe('The user exposes every device.')
  })

  it('counts the allowed devices', () => {
    expect(describeExposure(allow('light.kitchen'))).toContain('only 1 chosen device.')
    expect(describeExposure(allow('light.kitchen', 'light.hall'))).toContain('only 2 chosen devices.')
  })

  it('says that nothing is reachable under an empty allow list', () => {
    expect(describeExposure(allow())).toContain('exposes no device')
  })

  it('counts the blocked devices', () => {
    expect(describeExposure(deny('lock.front_door'))).toContain('blocks 1 device.')
  })

  it('reads an empty deny list as every device', () => {
    expect(describeExposure(deny())).toBe('The user exposes every device.')
  })
})

describe('isExposureMode', () => {
  it('accepts the three modes', () => {
    expect(isExposureMode('all')).toBe(true)
    expect(isExposureMode('allow')).toBe(true)
    expect(isExposureMode('deny')).toBe(true)
  })

  it('rejects a value from an older build or a hand edit', () => {
    // The settings page and the policy must never read different rules.
    expect(isExposureMode('domains')).toBe(false)
    expect(isExposureMode('')).toBe(false)
    expect(isExposureMode(undefined)).toBe(false)
    expect(isExposureMode(['allow'])).toBe(false)
  })
})
