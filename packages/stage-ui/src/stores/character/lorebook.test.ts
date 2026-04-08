import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

import { useLorebookStore } from './lorebook'

describe('lorebook store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  describe('addEntry', () => {
    it('adds and returns an entry with generated id', () => {
      const store = useLorebookStore()
      const entry = store.addEntry({
        keys: ['tokyo'],
        content: 'Tokyo is the capital of Japan.',
        enabled: true,
        insertionOrder: 0,
      })

      expect(entry.id).toBeTruthy()
      expect(entry.keys).toEqual(['tokyo'])
      expect(store.entries).toHaveLength(1)
    })
  })

  describe('removeEntry', () => {
    it('removes by id', () => {
      const store = useLorebookStore()
      const entry = store.addEntry({ keys: ['a'], content: 'A', enabled: true, insertionOrder: 0 })
      store.addEntry({ keys: ['b'], content: 'B', enabled: true, insertionOrder: 1 })

      store.removeEntry(entry.id)
      expect(store.entries).toHaveLength(1)
      expect(store.entries[0].keys).toEqual(['b'])
    })
  })

  describe('scanForMatches', () => {
    it('matches by primary key', () => {
      const store = useLorebookStore()
      store.addEntry({ keys: ['dragon'], content: 'Dragons breathe fire.', enabled: true, insertionOrder: 0 })
      store.addEntry({ keys: ['unicorn'], content: 'Unicorns are magical.', enabled: true, insertionOrder: 1 })

      const matches = store.scanForMatches('I saw a dragon yesterday')
      expect(matches).toHaveLength(1)
      expect(matches[0].content).toBe('Dragons breathe fire.')
    })

    it('case insensitive by default', () => {
      const store = useLorebookStore()
      store.addEntry({ keys: ['Tokyo'], content: 'Capital city.', enabled: true, insertionOrder: 0 })

      expect(store.scanForMatches('I went to tokyo')).toHaveLength(1)
    })

    it('case sensitive when configured', () => {
      const store = useLorebookStore()
      store.addEntry({ keys: ['Tokyo'], content: 'Capital city.', enabled: true, caseSensitive: true, insertionOrder: 0 })

      expect(store.scanForMatches('I went to tokyo')).toHaveLength(0)
      expect(store.scanForMatches('I went to Tokyo')).toHaveLength(1)
    })

    it('always includes constant entries', () => {
      const store = useLorebookStore()
      store.addEntry({ keys: ['never-match'], content: 'Always present.', enabled: true, constant: true, insertionOrder: 0 })

      expect(store.scanForMatches('unrelated text')).toHaveLength(1)
    })

    it('skips disabled entries', () => {
      const store = useLorebookStore()
      store.addEntry({ keys: ['dragon'], content: 'Disabled.', enabled: false, insertionOrder: 0 })

      expect(store.scanForMatches('dragon')).toHaveLength(0)
    })

    it('requires secondary keys when selective', () => {
      const store = useLorebookStore()
      store.addEntry({
        keys: ['castle'],
        secondaryKeys: ['king'],
        content: 'The king lives in the castle.',
        enabled: true,
        selective: true,
        insertionOrder: 0,
      })

      expect(store.scanForMatches('I visited the castle')).toHaveLength(0)
      expect(store.scanForMatches('The king went to the castle')).toHaveLength(1)
    })

    it('sorts by insertion order', () => {
      const store = useLorebookStore()
      store.addEntry({ keys: ['b'], content: 'Second', enabled: true, insertionOrder: 2 })
      store.addEntry({ keys: ['a'], content: 'First', enabled: true, insertionOrder: 1 })

      const matches = store.scanForMatches('a and b together')
      expect(matches[0].content).toBe('First')
      expect(matches[1].content).toBe('Second')
    })
  })

  describe('importFromCharacterBook', () => {
    it('imports entries from character book format', () => {
      const store = useLorebookStore()
      store.importFromCharacterBook([
        {
          keys: ['test'],
          content: 'Test entry.',
          enabled: true,
          insertion_order: 0,
          extensions: {},
        },
      ])

      expect(store.entries).toHaveLength(1)
      expect(store.entries[0].content).toBe('Test entry.')
    })
  })
})
