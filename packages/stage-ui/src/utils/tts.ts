import type { ReaderLike } from 'clustr'

import type { UseQueueReturn } from '../composables/queue'

import { readGraphemeClusters } from 'clustr'

// A special character to instruct the TTS pipeline to flush
export const TTS_FLUSH_INSTRUCTION = '\u200B'

const keptPunctuations = new Set('?？!！')
const hardPunctuations = new Set('.。?？!！…⋯～~「」\n\t\r')
const softPunctuations = new Set(',，、–—:：;；《》')

export interface TTSInputChunk {
  text: string
  words: number
  reason: 'boost' | 'limit' | 'hard' | 'flush'
}

export interface TTSInputChunkOptions {
  boost?: number
  minimumWords?: number
  maximumWords?: number
}

/**
 * Processes the input string or UTF-8 byte stream reader into chunks suitable for TTS synthesis.
 *
 * @param input A string or a ReaderLike object that reads from an underlying UTF-8 byte stream.
 * @param options
 * @param options.boost Specifies the number of chunks to yield using greedier rules. This may help
 *                      reduce the initial delay when processing long input text.
 * @param options.minimumWords Minimum number of words in a chunk.
 * @param options.maximumWords Maximum number of words in a chunk.
 */
export async function* chunkTTSInput(input: string | ReaderLike, options?: TTSInputChunkOptions): AsyncGenerator<TTSInputChunk, void, unknown> {
  const {
    boost = 2,
    minimumWords = 4,
    maximumWords = 12,
  } = options ?? {}

  const iterator = readGraphemeClusters(
    typeof input === 'string'
      ? new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode(input))
            controller.close()
          },
        }).getReader()
      : input,
  )

  const segmenter = new Intl.Segmenter(undefined, { granularity: 'word' }) // I love Intl.Segmenter

  let yieldCount = 0
  let buffer = ''
  let chunk = ''
  let chunkWordsCount = 0

  let previousValue: string | undefined
  let current = await iterator.next()

  while (!current.done) {
    const value = current.value

    if (value.length > 1) {
      previousValue = value
      current = await iterator.next()
      continue
    }

    const flush = value === TTS_FLUSH_INSTRUCTION
    const hard = hardPunctuations.has(value)
    const soft = softPunctuations.has(value)
    const kept = keptPunctuations.has(value)

    if (flush || hard || soft) {
      switch (value) {
        case '.':
        case ',': {
          if (previousValue !== undefined && /\d/.test(previousValue)) {
            const next = await iterator.next()
            if (!next.done && next.value && /\d/.test(next.value)) {
              // This dot could be a decimal point, so we skip it (don't fully skip! keep in tts input!)

              // REVIEW: @Lilia-Chen I think we need to remove the below line
              // 1. Not sensible to let the previousValue to be the value of the next value
              // 2. after the continue (jump to the bottom of the while loop), the previousValue will be reset to value, so this value assignment doesn't work at all
              // previousValue = next.value

              // If we don't append value ("." or ","), we will lose the decimal point, and 2.5 will become 25, which hugely impacted the tts...
              buffer += value
              current = next
              continue
            }
          }
        }
      }

      if (buffer.length === 0) {
        previousValue = value
        current = await iterator.next()
        continue
      }

      const words = [...segmenter.segment(buffer)].filter(w => w.isWordLike)

      if (chunkWordsCount > minimumWords && chunkWordsCount + words.length > maximumWords) {
        const text = kept ? chunk.trim() + value : chunk.trim()
        yield {
          text,
          words: chunkWordsCount,
          reason: 'limit',
        }
        yieldCount++
        chunk = ''
        chunkWordsCount = 0
      }

      chunk += buffer + value
      chunkWordsCount += words.length
      buffer = ''

      if (flush || hard || chunkWordsCount > maximumWords || yieldCount < boost) {
        const text = chunk.trim()
        yield {
          text,
          words: chunkWordsCount,
          reason: flush ? 'flush' : hard ? 'hard' : chunkWordsCount > maximumWords ? 'limit' : 'boost',
        }
        yieldCount++
        chunk = ''
        chunkWordsCount = 0
      }

      previousValue = value
      current = await iterator.next()
      continue
    }

    buffer += value
    // eslint-disable-next-line no-console
    console.debug('current buffer: ', buffer)
    previousValue = value
    // For debugging why it stuck at "xxxx\u200B"
    const next = await iterator.next()
    // if (next.value ==='\u200B') {
    //   console.debug("TTS_FLUSH get for the next value!")
    // } else {
    //   console.debug("the next value: ", next.value)
    // }
    current = next
  }

  // eslint-disable-next-line no-console
  console.debug('while loop ends, chunk/buffer:', chunk, buffer)
  if (chunk.length > 0 || buffer.length > 0) {
    const text = (chunk + buffer).trim()
    yield {
      text,
      words: chunkWordsCount + [...segmenter.segment(buffer)].filter(w => w.isWordLike).length,
      reason: 'flush',
    }
  }
}

export async function chunkToTTSQueue(reader: ReaderLike, queue: UseQueueReturn<string>) {
  try {
    for await (const chunk of chunkTTSInput(reader)) {
      // eslint-disable-next-line no-console
      console.debug('chunk to be pushed: ', chunk)
      await queue.add(chunk.text)
    }
  }
  catch (e) {
    console.error('Error chunking stream to TTS queue:', e)
  }
}
