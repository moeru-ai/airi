import { describe, expect, it, vi } from 'vitest'

import { useCaptionItems } from './useCaptionItems'

describe('useCaptionItems', () => {
  it('expires each caption event without cancelling earlier events of the same type', () => {
    vi.useFakeTimers()

    try {
      const captions = useCaptionItems({ ttlMs: 1000 })

      captions.add({ text: 'first', type: 'caption-speaker' })
      vi.advanceTimersByTime(500)
      captions.add({ text: 'second', type: 'caption-speaker' })

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

      captions.add({ text: 'speaker', type: 'caption-speaker' })
      captions.add({ text: 'assistant', type: 'caption-assistant' })
      captions.add({ text: '', type: 'caption-speaker' })

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

      captions.add({ operation: 'replace', text: '今天天气很号', type: 'caption-speaker' })
      vi.advanceTimersByTime(500)
      captions.add({ operation: 'replace', text: '今天天气很好', type: 'caption-speaker' })

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
})
