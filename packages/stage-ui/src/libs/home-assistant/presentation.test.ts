import type { HomeAssistantEntity } from './client'

import { describe, expect, it } from 'vitest'

import { domainIcon, domainLabel, domainLabelKey, isEntityActive, isTranslatableState, parseStateMoment, stateLabelKeys, summarizeDomains, summarizeEntities } from './presentation'

function entity(entityId: string, state = 'on', attributes: Record<string, unknown> = {}): HomeAssistantEntity {
  return { entityId, state, attributes }
}

describe('summarizeEntities', () => {
  it('reduces an entity to the fields a tile shows', () => {
    const [summary] = summarizeEntities([
      entity('light.kitchen', 'on', { friendly_name: 'Kitchen', brightness: 120 }),
    ])

    expect(summary).toEqual({
      entityId: 'light.kitchen',
      domain: 'light',
      name: 'Kitchen',
      state: 'on',
      iconClass: 'i-solar:lightbulb-bold-duotone',
      active: true,
    })
  })

  it('falls back to the entity id when the instance reports no name', () => {
    const [summary] = summarizeEntities([entity('switch.pump', 'off')])

    expect(summary.name).toBe('switch.pump')
    expect(summary.active).toBe(false)
  })

  it('ignores an empty friendly name', () => {
    const [summary] = summarizeEntities([entity('switch.pump', 'off', { friendly_name: '' })])

    expect(summary.name).toBe('switch.pump')
  })
})

describe('domainIcon', () => {
  it('names a known domain', () => {
    expect(domainIcon('lock')).toBe('i-solar:lock-bold-duotone')
  })

  it('falls back for a domain outside the table', () => {
    expect(domainIcon('some_future_domain')).toBe('i-solar:question-circle-bold-duotone')
  })

  it('draws a conversation agent as Home Assistant, not as a microphone', () => {
    // conversation.home_assistant is the built-in agent, not a device that
    // listens. It carries the icon of the module entry for Home Assistant.
    expect(domainIcon('conversation')).toBe('i-solar:home-smile-bold-duotone')
    expect(domainIcon('conversation')).not.toBe(domainIcon('stt'))
    expect(domainIcon('tts')).not.toBe(domainIcon('stt'))
  })
})

describe('isEntityActive', () => {
  it('reads the active state of each domain', () => {
    expect(isEntityActive('light', 'on')).toBe(true)
    expect(isEntityActive('light', 'off')).toBe(false)
    // A cover is active when it is open, not when it is "on".
    expect(isEntityActive('cover', 'open')).toBe(true)
    expect(isEntityActive('cover', 'closed')).toBe(false)
    expect(isEntityActive('lock', 'locked')).toBe(true)
    expect(isEntityActive('lock', 'unlocked')).toBe(false)
    expect(isEntityActive('vacuum', 'cleaning')).toBe(true)
    expect(isEntityActive('vacuum', 'docked')).toBe(false)
    expect(isEntityActive('person', 'home')).toBe(true)
    expect(isEntityActive('media_player', 'playing')).toBe(true)
    expect(isEntityActive('media_player', 'idle')).toBe(false)
    expect(isEntityActive('climate', 'heat')).toBe(true)
    expect(isEntityActive('climate', 'off')).toBe(false)
  })

  it('treats a state the domain never shows as inactive', () => {
    expect(isEntityActive('light', 'unavailable')).toBe(false)
    expect(isEntityActive('light', 'unknown')).toBe(false)
    // A sensor reports a reading, not an active state.
    expect(isEntityActive('sensor', '21.5')).toBe(false)
  })
})

describe('summarizeDomains', () => {
  it('counts the entities of each domain and sorts by name', () => {
    expect(summarizeDomains([
      entity('light.kitchen'),
      entity('light.hall'),
      entity('lock.front_door'),
    ])).toEqual([
      { domain: 'light', count: 2 },
      { domain: 'lock', count: 1 },
    ])
  })

  it('accepts a summarized row, because the page has no raw entities', () => {
    expect(summarizeDomains([{ entityId: 'light.kitchen' }, { entityId: 'lock.front_door' }]))
      .toEqual([{ domain: 'light', count: 1 }, { domain: 'lock', count: 1 }])
  })

  it('returns nothing for an empty list', () => {
    expect(summarizeDomains([])).toEqual([])
  })
})

describe('domainLabel', () => {
  it('names the key it looks up', () => {
    expect(domainLabelKey('light')).toBe('settings.pages.modules.home-assistant.domains.light')
  })

  it('returns the translation', () => {
    expect(domainLabel(key => (key.endsWith('.light') ? 'Light' : key), 'light')).toBe('Light')
  })

  it('falls back to the raw domain when the translation is missing', () => {
    // A translator returns the key itself for a key it cannot find, so the tab
    // shows "some_future_domain" rather than the key path that produced it.
    expect(domainLabel(key => key, 'some_future_domain')).toBe('some_future_domain')
  })
})

describe('isTranslatableState', () => {
  it('accepts the names Home Assistant writes', () => {
    expect(isTranslatableState('locked')).toBe(true)
    expect(isTranslatableState('not_home')).toBe(true)
    expect(isTranslatableState('clear-night')).toBe(true)
  })

  it('rejects a value, which the table could never name', () => {
    expect(isTranslatableState('21.5')).toBe(false)
    expect(isTranslatableState('2026-10-10T11:14:39+00:00')).toBe(false)
    expect(isTranslatableState('On')).toBe(false)
    expect(isTranslatableState('')).toBe(false)
  })
})

describe('stateLabelKeys', () => {
  it('asks for the domain first and the shared block second', () => {
    expect(stateLabelKeys('lock', 'locked')).toEqual([
      'settings.pages.modules.home-assistant.states.lock.locked',
      'settings.pages.modules.home-assistant.states.generic.locked',
    ])
  })
})

describe('parseStateMoment', () => {
  it('reads a date as a local day, so a western timezone cannot shift it', () => {
    const moment = parseStateMoment('2020-01-01')

    expect(moment?.kind).toBe('date')
    expect(moment?.at.getFullYear()).toBe(2020)
    expect(moment?.at.getMonth()).toBe(0)
    expect(moment?.at.getDate()).toBe(1)
  })

  it('reads a timestamp with an offset', () => {
    const moment = parseStateMoment('2026-10-10T11:14:39.045920+00:00')

    expect(moment?.kind).toBe('datetime')
    expect(moment?.at.toISOString()).toBe('2026-10-10T11:14:39.045Z')
  })

  it('reads a timestamp without seconds or an offset', () => {
    expect(parseStateMoment('2026-10-10T11:14')?.kind).toBe('datetime')
    expect(parseStateMoment('2026-10-10 11:14:39')?.kind).toBe('datetime')
  })

  it('rejects a value that is not a date', () => {
    expect(parseStateMoment('21.5')).toBeUndefined()
    expect(parseStateMoment('locked')).toBeUndefined()
    expect(parseStateMoment('2026-13-45')).toBeDefined()
    expect(parseStateMoment('10-10-2026')).toBeUndefined()
  })
})
