// @vitest-environment node

import { describe, expect, it, vi } from 'vitest'

import { useCaptionItems } from './useCaptionItems'

describe('useCaptionItems', () => {
  it('expires each caption event without cancelling earlier events of the same type', () => {
    vi.useFakeTimers()

    try {
      const captions = useCaptionItems({ ttlMs: 1000 })

      captions.add({ type: 'caption-speaker', text: 'first' })
      vi.advanceTimersByTime(500)
      captions.add({ type: 'caption-speaker', text: 'second' })

      expect(captions.items.value.map(item => item.text)).toEqual(['first', 'second'])

      vi.advanceTimersByTime(500)

      expect(captions.items.value.map(item => item.text)).toEqual(['second'])

      vi.advanceTimersByTime(500)

      expect(captions.items.value).toEqual([])
    }
    finally {
      vi.useRealTimers()
    }
  })

  it('clears caption items of the matching type when an empty event arrives', () => {
    vi.useFakeTimers()

    try {
      const captions = useCaptionItems({ ttlMs: 1000 })

      captions.add({ type: 'caption-speaker', text: 'speaker' })
      captions.add({ type: 'caption-assistant', text: 'assistant' })
      captions.add({ type: 'caption-speaker', text: '' })

      expect(captions.items.value.map(item => item.text)).toEqual(['assistant'])

      vi.advanceTimersByTime(1000)

      expect(captions.items.value).toEqual([])
    }
    finally {
      vi.useRealTimers()
    }
  })

  // ROOT CAUSE:
  //
  // Streaming providers send a complete volatile sentence on each update.
  // The caption overlay appended every correction as a separate item.
  it('replaces volatile speaker captions without accumulating corrections', () => {
    vi.useFakeTimers()

    try {
      const captions = useCaptionItems({ ttlMs: 1000 })

      captions.add({ operation: 'replace', type: 'caption-speaker', text: '今天天气很号' })
      vi.advanceTimersByTime(500)
      captions.add({ operation: 'replace', type: 'caption-speaker', text: '今天天气很好' })

      expect(captions.items.value).toHaveLength(1)
      expect(captions.items.value[0]?.text).toBe('今天天气很好')

      vi.advanceTimersByTime(500)

      expect(captions.items.value).toHaveLength(1)

      vi.advanceTimersByTime(500)

      expect(captions.items.value).toEqual([])
    }
    finally {
      vi.useRealTimers()
    }
  })
  it('keeps translated replacements separate from source captions and expires the latest text', () => {
    vi.useFakeTimers()

    try {
      const captions = useCaptionItems({ ttlMs: 1000 })
      captions.add({ type: 'caption-speaker', text: 'Question' })
      captions.add({ type: 'caption-assistant', text: 'Hello world' })
      captions.add({ type: 'caption-translation', operation: 'replace', text: '你好' })
      const translationId = captions.items.value.at(-1)?.id
      vi.advanceTimersByTime(500)
      captions.add({ type: 'caption-translation', operation: 'replace', text: '你好世界' })

      expect(captions.items.value.map(item => item.text)).toEqual(['Question', 'Hello world', '你好世界'])
      expect(captions.items.value.at(-1)?.id).toBe(translationId)
      vi.advanceTimersByTime(500)
      expect(captions.items.value.map(item => item.text)).toEqual(['你好世界'])
      vi.advanceTimersByTime(500)
      expect(captions.items.value).toEqual([])
    }
    finally {
      vi.useRealTimers()
    }
  })

  it('clears a translated response without clearing the source captions', () => {
    vi.useFakeTimers()

    try {
      const captions = useCaptionItems({ ttlMs: 1000 })
      captions.add({ type: 'caption-assistant', text: 'Hello world' })
      captions.add({ type: 'caption-translation', operation: 'replace', text: '你好世界' })
      captions.add({ type: 'caption-translation', operation: 'replace', text: '' })

      expect(captions.items.value.map(item => item.text)).toEqual(['Hello world'])
      captions.dispose()
      expect(captions.items.value).toEqual([])
      expect(vi.getTimerCount()).toBe(0)
    }
    finally {
      vi.useRealTimers()
    }
  })
})
