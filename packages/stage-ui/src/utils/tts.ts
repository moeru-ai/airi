import type { ReaderLike } from 'clustr'

import type { UseQueueReturn } from '../composables/queue'

import { readGraphemeClusters } from 'clustr'

// A special character to instruct the TTS pipeline to flush
export const TTS_FLUSH_INSTRUCTION = '\u200B'

const keptPunctuations = new Set('?？!！')
const hardPunctuations = new Set('.。?？!！…⋯～~\n\t\r')
const softPunctuations = new Set(',，、–—:：;；《》「」')

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
    let value = current.value

    if (value.length > 1) {
      previousValue = value
      current = await iterator.next()
      continue
    }

    const flush = value === TTS_FLUSH_INSTRUCTION
    const hard = hardPunctuations.has(value)
    const soft = softPunctuations.has(value)
    const kept = keptPunctuations.has(value)
    let next: IteratorResult<string, any> | undefined
    let afterNext: IteratorResult<string, any> | undefined

    if (flush || hard || soft) {
      switch (value) {
        case '.':
        case ',': {
          if (previousValue !== undefined && /\d/.test(previousValue)) {
            next = await iterator.next()
            if (!next.done && next.value && /\d/.test(next.value)) {
              // This dot could be a decimal point, so we skip it (don't fully skip! keep in tts input!)

              // REVIEW: @Lilia-Chen I think we need to remove the below line
              // 1. Not sensible to let the previousValue to be the value of the next value
              // 2. after the continue (jump to the bottom of the while loop), the previousValue will be reset to value, so this value assignment doesn't work at all
              // previousValue = next.value

              // If we don't append value ("." or ","), we will lose the decimal point, and 2.5 will become 25, which hugely impacted the tts...
              buffer += value
              current = next
              next = undefined
              continue
            }
          }
          else if (value === '.') {
            // trying catch '...' and turn it into U+2026
            next = await iterator.next()
            if (!next.done && next.value && next.value === '.') {
              afterNext = await iterator.next()
              // If this is a '...' repalce the current value
              if (!afterNext.done && afterNext.value && afterNext.value === '.') {
                value = '…'
                next = undefined
                afterNext = undefined
              }
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
      // If next had been read during decimal recognition or "..." recognition
      if (next !== undefined) {
        // If afterNext had also been read
        if (afterNext !== undefined) {
          // The only case that the program will come to this place is:
          // "x..y" and y is not a "." so "..." is not recognised
          // ".." is not a legal punctuation so ignored.
          // The first "." had been consumed during hard flush
          // next.value = second '.'
          // afterNext.value = 'y', so we just need to care about 'y'
          // In case 'y' is not just a useless blank. It's OK if 'y' is blank since we have `text = chunk.trim()`
          current = afterNext
          next = undefined
          afterNext = undefined
        }
        else {
          // Only next had been read
          // This is the case where "x.y" and x is a number but y is not
          // In case 'y' is not just a useless blank. It's OK if 'y' is blank since we have `text = chunk.trim()`
          current = next
          next = undefined
        }
      }
      else {
        // No next nor afterNext, so run `iterator.next()`
        current = await iterator.next()
      }
      // No need to do anything with buffer, just jump to the next loop
      continue
    }
    // If normal character enters, add it to the buffer and move to the next
    buffer += value
    previousValue = value
    next = await iterator.next()
    current = next
  }

  // TODO: remove later
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
      // TODO: remove later
      // eslint-disable-next-line no-console
      console.debug('chunk to be pushed: ', chunk)
      await queue.add(chunk.text)
    }
  }
  catch (e) {
    console.error('Error chunking stream to TTS queue:', e)
  }
}
