import type { Card } from '@proj-airi/ccc'

import { describe, expect, it } from 'vitest'

import { selectLorebookEntries } from './lorebook'

type Lorebook = NonNullable<Card['characterBook']>
type LorebookEntry = Lorebook['entries'][number]

function entry(overrides: Partial<LorebookEntry>): LorebookEntry {
  return {
    keys: [],
    content: '',
    enabled: true,
    insertion_order: 0,
    use_regex: false,
    extensions: {},
    ...overrides,
  }
}

function book(entries: LorebookEntry[], scanDepth?: number): Lorebook {
  return { entries, scan_depth: scanDepth, extensions: {} }
}

function contentsOf(entries: LorebookEntry[]) {
  return entries.map(item => item.content)
}

describe('selectLorebookEntries', () => {
  it('selects an entry when a key is in the current message, ignoring case', () => {
    const lore = book([entry({ keys: ['Birthday'], content: 'birthday fact' })])

    expect(contentsOf(selectLorebookEntries(lore, [], 'my BIRTHDAY is soon'))).toEqual(['birthday fact'])
  })

  it('does not select an entry when no key is in the scanned text', () => {
    const lore = book([entry({ keys: ['birthday'], content: 'birthday fact' })])

    expect(selectLorebookEntries(lore, ['hello'], 'how are you')).toEqual([])
  })

  it('searches only the last scan_depth history messages', () => {
    const lore = book([entry({ keys: ['tea'], content: 'tea fact' })], 1)

    expect(selectLorebookEntries(lore, ['I like tea', 'ok'], 'hi')).toEqual([])
    expect(contentsOf(selectLorebookEntries(lore, ['ok', 'I like tea'], 'hi'))).toEqual(['tea fact'])
  })

  it('always selects constant entries and skips disabled entries', () => {
    const lore = book([
      entry({ constant: true, content: 'constant fact' }),
      entry({ constant: true, enabled: false, content: 'disabled fact' }),
    ])

    expect(contentsOf(selectLorebookEntries(lore, [], 'anything'))).toEqual(['constant fact'])
  })

  it('needs a secondary key for a selective entry', () => {
    const lore = book([entry({ keys: ['game'], secondary_keys: ['retro'], selective: true, content: 'retro fact' })])

    expect(selectLorebookEntries(lore, [], 'a new game')).toEqual([])
    expect(contentsOf(selectLorebookEntries(lore, [], 'a retro game'))).toEqual(['retro fact'])
  })

  it('respects case_sensitive keys', () => {
    const lore = book([entry({ keys: ['Mira'], case_sensitive: true, content: 'name fact' })])

    expect(selectLorebookEntries(lore, [], 'mira')).toEqual([])
    expect(contentsOf(selectLorebookEntries(lore, [], 'Mira'))).toEqual(['name fact'])
  })

  it('matches regex keys and treats an invalid pattern as no match', () => {
    const lore = book([
      entry({ keys: ['colou?r'], use_regex: true, content: 'color fact' }),
      entry({ keys: ['('], use_regex: true, content: 'broken fact' }),
    ])

    expect(contentsOf(selectLorebookEntries(lore, [], 'favourite colour ('))).toEqual(['color fact'])
  })

  it('orders entries by insertion_order, lowest first', () => {
    const lore = book([
      entry({ constant: true, insertion_order: 20, content: 'second' }),
      entry({ constant: true, insertion_order: 10, content: 'first' }),
    ])

    expect(contentsOf(selectLorebookEntries(lore, [], ''))).toEqual(['first', 'second'])
  })
})
