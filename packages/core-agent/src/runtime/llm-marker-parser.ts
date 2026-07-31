const TAG_OPEN = '<|'
const TAG_CLOSE = '|>'
const ESCAPED_TAG_OPEN = '<{\'|\'}'
const ESCAPED_TAG_CLOSE = '{\'|\'}>'

interface MarkerToken {
  type: 'literal' | 'special'
  value: string
}

interface MarkerParserOptions {
  minLiteralEmitLength?: number
}

interface ControlTokenSyntax {
  prefix: string
  suffix: string
}

interface StreamController<T> {
  stream: ReadableStream<T>
  write: (value: T) => void
  close: () => void
  error: (err: unknown) => void
}

const controlTokenSyntaxes: ControlTokenSyntax[] = [
  { prefix: '<|ACT ', suffix: '|>' },
  { prefix: '<|ACT:', suffix: '|>' },
  { prefix: '|ACT:', suffix: '|' },
  { prefix: '<|ACT|>', suffix: '' },
  { prefix: '<|DELAY ', suffix: '|>' },
  { prefix: '<|DELAY:', suffix: '|>' },
  { prefix: '|DELAY:', suffix: '|' },
  { prefix: '<|DELAY|>', suffix: '' },
  { prefix: '<|CALL ', suffix: '|>' },
  { prefix: '<|CALL:', suffix: '|>' },
  { prefix: '|CALL:', suffix: '|' },
  { prefix: '<|CALL|>', suffix: '' },
]

function findNextControlToken(text: string, startIndex: number) {
  let match: (ControlTokenSyntax & { index: number }) | undefined

  for (const syntax of controlTokenSyntaxes) {
    const index = text.indexOf(syntax.prefix, startIndex)
    if (index < 0 || (match && index >= match.index))
      continue

    match = { ...syntax, index }
  }

  return match
}

function findControlTokenEnd(
  text: string,
  startIndex: number,
  suffix: string,
) {
  let quote: '"' | '\'' | undefined
  let escaped = false

  for (let index = startIndex; index < text.length; index++) {
    const character = text[index]

    if (quote) {
      if (escaped) {
        escaped = false
      }
      else if (character === '\\') {
        escaped = true
      }
      else if (character === quote) {
        quote = undefined
      }

      continue
    }

    if (character === '"' || character === '\'') {
      quote = character
      continue
    }

    if (text.startsWith(suffix, index))
      return index + suffix.length
  }

  return -1
}

/**
 * Removes AIRI streaming-control tokens from a completed model response.
 *
 * Validity is intentionally not checked here: this is a presentation boundary,
 * so completed legacy or malformed control tokens must not expose their private
 * metadata. An incomplete recognized token suppresses the remaining suffix for
 * the same reason.
 */
export function stripLlmControlTokens(text: string): string {
  let visibleText = ''
  let cursor = 0

  while (cursor < text.length) {
    const token = findNextControlToken(text, cursor)

    if (!token) {
      visibleText += text.slice(cursor)
      break
    }

    visibleText += text.slice(cursor, token.index)

    const tokenEnd = findControlTokenEnd(
      text,
      token.index + token.prefix.length,
      token.suffix,
    )

    // An unterminated control token may contain private model metadata.
    if (tokenEnd < 0)
      break

    cursor = tokenEnd
  }

  return visibleText
}

function createPushStream<T>(): StreamController<T> {
  let closed = false
  let controller: ReadableStreamDefaultController<T> | null = null

  const stream = new ReadableStream<T>({
    start(ctrl) {
      controller = ctrl
    },
    cancel() {
      closed = true
    },
  })

  return {
    stream,
    write(value) {
      if (!controller || closed)
        return
      controller.enqueue(value)
    },
    close() {
      if (!controller || closed)
        return
      closed = true
      controller.close()
    },
    error(err) {
      if (!controller || closed)
        return
      closed = true
      controller.error(err)
    },
  }
}

async function readStream<T>(stream: ReadableStream<T>, handler: (value: T) => Promise<void> | void) {
  const reader = stream.getReader()
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done)
        break
      await handler(value as T)
    }
  }
  finally {
    reader.releaseLock()
  }
}

function createLlmMarkerParser(options?: MarkerParserOptions) {
  const minLiteralEmitLength = Math.max(1, options?.minLiteralEmitLength ?? 1)
  const tailLength = Math.max(TAG_OPEN.length - 1, ESCAPED_TAG_OPEN.length - 1)
  let buffer = ''
  let inTag = false

  return {
    async consume(textPart: string, onLiteral: (value: string) => Promise<void> | void, onSpecial: (value: string) => Promise<void> | void) {
      buffer += textPart
      buffer = buffer
        .replaceAll(ESCAPED_TAG_OPEN, TAG_OPEN)
        .replaceAll(ESCAPED_TAG_CLOSE, TAG_CLOSE)

      while (buffer.length > 0) {
        if (!inTag) {
          const openTagIndex = buffer.indexOf(TAG_OPEN)
          if (openTagIndex < 0) {
            if (buffer.length - tailLength >= minLiteralEmitLength) {
              const emit = buffer.slice(0, -tailLength)
              buffer = buffer.slice(-tailLength)
              await onLiteral(emit)
            }
            break
          }

          if (openTagIndex > 0) {
            const emit = buffer.slice(0, openTagIndex)
            buffer = buffer.slice(openTagIndex)
            await onLiteral(emit)
          }
          inTag = true
        }
        else {
          const closeTagIndex = buffer.indexOf(TAG_CLOSE)
          if (closeTagIndex < 0)
            break

          const emit = buffer.slice(0, closeTagIndex + TAG_CLOSE.length)
          buffer = buffer.slice(closeTagIndex + TAG_CLOSE.length)
          await onSpecial(emit)
          inTag = false
        }
      }
    },

    async end(onLiteral: (value: string) => Promise<void> | void) {
      if (!inTag && buffer.length > 0) {
        await onLiteral(buffer)
        buffer = ''
      }
    },
  }
}

function createLlmMarkerStream(input: ReadableStream<string>, options?: MarkerParserOptions) {
  const { stream, write, close, error } = createPushStream<MarkerToken>()
  const parser = createLlmMarkerParser(options)

  void readStream(input, async (chunk) => {
    await parser.consume(
      chunk,
      async (literal) => {
        if (!literal)
          return
        write({ type: 'literal', value: literal })
      },
      async (special) => {
        write({ type: 'special', value: special })
      },
    )
  })
    .then(async () => {
      await parser.end(async (literal) => {
        if (!literal)
          return
        write({ type: 'literal', value: literal })
      })
      close()
    })
    .catch((err) => {
      error(err)
    })

  return stream
}

/**
 * Creates a streaming parser for LLM responses with AIRI special markers.
 *
 * Use when:
 * - Handling streamed model output that may contain `<|...|>` markers.
 * - Literal text and special marker tokens need to be emitted separately.
 *
 * Expects:
 * - Callers feed chunks in order and call `end()` once the model stream ends.
 *
 * Returns:
 * - A parser with `consume()` and `end()` methods.
 */
export function useLlmmarkerParser(options: {
  onLiteral?: (literal: string) => void | Promise<void>
  onSpecial?: (special: string) => void | Promise<void>
  /**
   * Called when parsing ends with the full accumulated text.
   * Useful for final processing like categorization or filtering.
   */
  onEnd?: (fullText: string) => void | Promise<void>
  /**
   * The minimum length of text required to emit a literal part.
   * Useful for avoiding emitting literal parts too fast.
   */
  minLiteralEmitLength?: number
}) {
  let fullText = ''
  const { stream, write, close } = createPushStream<string>()

  const markerStream = createLlmMarkerStream(stream, { minLiteralEmitLength: options.minLiteralEmitLength })

  const processing = readStream(markerStream, async (token) => {
    if (token.type === 'literal')
      await options.onLiteral?.(token.value)
    if (token.type === 'special')
      await options.onSpecial?.(token.value)
  })

  return {
    /**
     * Consumes a chunk of text from the stream.
     *
     * @param textPart The chunk of text to consume.
     */
    async consume(textPart: string) {
      fullText += textPart
      write(textPart)
    },

    /**
     * Finalizes the parsing process.
     * Any remaining content in the buffer is flushed as a final literal part.
     */
    async end() {
      close()
      await processing
      await options.onEnd?.(fullText)
    },
  }
}
