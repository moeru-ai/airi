import type { ReaderLike } from 'clustr'

import type { TextSegment, TextToken } from '../types'

import { readGraphemeClusters } from 'clustr'

import { createPushStream } from '../stream'

export const TTS_FLUSH_INSTRUCTION = '\u200B'
export const TTS_SPECIAL_TOKEN = '\u2063'

const regexpAnySingleDigit = /\d/

const keptPunctuations = new Set('?？!！')
const hardPunctuations = new Set('.。?？!！…⋯～~\n\t\r')
const softPunctuations = new Set(',，、–—:：;；《》「」')

export interface TtsInputChunk {
  text: string
  words: number
  reason: 'boost' | 'limit' | 'hard' | 'flush' | 'special'
}

export interface TtsInputChunkOptions {
  boost?: number
  minimumWords?: number
  maximumWords?: number
  stripNarrative?: boolean
  keepNarrativeText?: boolean
}

export interface TtsChunkItem {
  chunk: string
  special: string | null
  reason: 'boost' | 'limit' | 'hard' | 'flush' | 'special'
}

export async function* chunkTtsInput(
  input: string | ReaderLike,
  options?: TtsInputChunkOptions,
): AsyncGenerator<TtsInputChunk, void, unknown> {
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
    const special = value === TTS_SPECIAL_TOKEN
    const hard = hardPunctuations.has(value)
    const soft = softPunctuations.has(value)
    const kept = keptPunctuations.has(value)
    let next: IteratorResult<string, any> | undefined
    let afterNext: IteratorResult<string, any> | undefined

    if (flush || special || hard || soft) {
      switch (value) {
        case '.':
        case ',': {
          if (previousValue !== undefined && regexpAnySingleDigit.test(previousValue)) {
            next = await iterator.next()
            if (!next.done && next.value && regexpAnySingleDigit.test(next.value)) {
              buffer += value
              current = next
              next = undefined
              continue
            }
          }
          else if (value === '.') {
            next = await iterator.next()
            if (!next.done && next.value && next.value === '.') {
              afterNext = await iterator.next()
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
        if (special) {
          yield {
            text: '',
            words: 0,
            reason: 'special',
          }
          yieldCount++
          chunkWordsCount = 0
        }

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

      if (special) {
        const text = chunk.slice(0, -1).trim()
        yield {
          text,
          words: chunkWordsCount,
          reason: 'special',
        }
        yieldCount++
        chunk = ''
        chunkWordsCount = 0
      }
      else if (flush || hard || chunkWordsCount > maximumWords || yieldCount < boost) {
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
      if (next !== undefined) {
        if (afterNext !== undefined) {
          current = afterNext
          next = undefined
          afterNext = undefined
        }
        else {
          current = next
          next = undefined
        }
      }
      else {
        current = await iterator.next()
      }
      continue
    }

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

export async function chunkEmitter(
  reader: ReaderLike,
  pendingSpecials: string[],
  options: TtsInputChunkOptions | undefined,
  handler: (ttsSegment: TtsChunkItem) => Promise<void> | void,
) {
  const sanitizeChunk = (text: string) => {
    const cleanedText = text
      .replaceAll(TTS_SPECIAL_TOKEN, '')
      .replaceAll(TTS_FLUSH_INSTRUCTION, '')

    return cleanedText.trim()
  }

  try {
    for await (const chunk of chunkTtsInput(reader, options)) {
      // TODO: remove later
      const cleanedText = sanitizeChunk(chunk.text)
      if (!cleanedText && chunk.reason !== 'special') {
        continue
      }

      if (chunk.reason === 'special') {
        const specialToken = pendingSpecials.shift()
        // console.debug("special yield:", specialToken)
        await handler({ chunk: cleanedText, special: specialToken ?? null, reason: chunk.reason })
      }
      else {
        await handler({ chunk: cleanedText, special: null, reason: chunk.reason })
      }
    }
  }
  catch (e) {
    console.error('Error chunking stream to TTS queue:', e)
  }
}

export function processNarrative(text: string, options?: TtsInputChunkOptions) {
  if (!options?.stripNarrative)
    return text

  const regex = /\*(.*?)\*|\[(.*?)\]|\((.*?)\)|（(.*?)）|【(.*?)】|<([^>0-9\s][^>]*)>/g

  return text.replace(regex, (match, g1, g2, g3, g4, g5, g6) => {
    if (options?.keepNarrativeText) {
      const innerWord = g1 || g2 || g3 || g4 || g5 || g6 || ''
      return innerWord
    }
    return ''
  })
}

export function createTtsSegmentStream(
  tokens: ReadableStream<TextToken>,
  meta: { streamId: string, intentId: string },
  options?: TtsInputChunkOptions,
) {
  const { stream, write, close, error } = createPushStream<TextSegment>()
  const pendingSpecials: string[] = []
  const encoder = new TextEncoder()

  const { stream: byteStream, write: writeBytes, close: closeBytes, error: errorBytes } = createPushStream<Uint8Array>()

  void (async () => {
    const reader = tokens.getReader()
    let pendingText = ''
    try {
      while (true) {
        const { value, done } = await reader.read()
        if (done)
          break
        if (!value)
          continue

        if (value.type === 'literal') {
          if (value.value) {
            if (!options?.stripNarrative) {
              writeBytes(encoder.encode(value.value))
              continue
            }

            pendingText += value.value
            const stack: string[] = []
            const pairs: Record<string, string> = {
              '[': ']',
              '(': ')',
              '（': '）',
              '【': '】',
              '<': '>',
            }
            const openers = Object.keys(pairs)
            const closers = Object.values(pairs)

            for (let i = 0; i < pendingText.length; i++) {
              const char = pendingText[i]
              if (openers.includes(char)) {
                if (char === '<') {
                  const remainder = pendingText.slice(i + 1)

                  if (remainder.length > 0 && /[0-9\s=]/.test(remainder[0])) {
                    continue
                  }

                  if (/^[a-z][^a-z>]|\s/i.test(remainder)) {
                    continue
                  }
                }
                stack.push(char)
              }
              else if (closers.includes(char)) {
                // 尝试匹配并弹出栈顶
                const lastOpen = stack[stack.length - 1]
                if (pairs[lastOpen] === char) {
                  stack.pop()
                }
              }
            }

            const bracketsUnclosed = stack.length > 0
            const starMatch = pendingText.match(/\*([^*]*)$/)
            const starsUnclosed = (pendingText.match(/\*/g) || []).length % 2 !== 0
              && starMatch !== null && !starMatch[1].startsWith(' ')
            const hasUnclosed = bracketsUnclosed || starsUnclosed
            const isStrippingActive = options?.stripNarrative && hasUnclosed
            const fallbackLimit = isStrippingActive ? 800 : 200

            if (!hasUnclosed || pendingText.length > fallbackLimit) {
              const textToEmit = processNarrative(pendingText, options)
              writeBytes(encoder.encode(textToEmit))
              pendingText = ''
            }
          }
        }
        else if (value.type === 'special' || value.type === 'flush') {
          if (pendingText) {
            const textToEmit = processNarrative(pendingText, options)
            writeBytes(encoder.encode(textToEmit))
            pendingText = ''
          }

          if (value.type === 'special') {
            pendingSpecials.push(value.value ?? '')
            writeBytes(encoder.encode(TTS_SPECIAL_TOKEN))
          }
          else if (value.type === 'flush') {
            writeBytes(encoder.encode(TTS_FLUSH_INSTRUCTION))
          }
        }
      }
      if (pendingText) {
        let finalPunt = pendingText
        if (options?.stripNarrative) {
          finalPunt = processNarrative(finalPunt, options)
        }
        writeBytes(encoder.encode(finalPunt))
      }
      closeBytes()
    }
    catch (err) {
      errorBytes(err)
    }
    finally {
      reader.releaseLock()
    }
  })()

  void (async () => {
    try {
      const reader = byteStream.getReader()
      await chunkEmitter(reader, pendingSpecials, options, async (chunk) => {
        write({
          streamId: meta.streamId,
          intentId: meta.intentId,
          segmentId: `${meta.streamId}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
          text: chunk.chunk,
          special: chunk.special,
          reason: chunk.reason,
          createdAt: Date.now(),
        })
      })
      close()
    }
    catch (err) {
      error(err)
    }
  })()

  return stream
}
