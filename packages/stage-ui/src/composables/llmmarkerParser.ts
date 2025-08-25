const TAG_OPEN = '<|'
const TAG_CLOSE = '|>'

/**
 * A streaming parser for LLM responses that contain special markers (e.g., for tool calls).
 * This composable is designed to be efficient and robust, using a regular expression
 * to handle special tags enclosed in `<|...|>`.
 *
 * @example
 * const parser = useLlmmarkerParser({
 *   onLiteral: (text) => console.log('Literal:', text),
 *   onSpecial: (tagContent) => console.log('Special:', tagContent),
 * });
 *
 * await parser.consume('This is some text <|tool_code|> and some more |> text.');
 * await parser.end();
 */
export function useLlmmarkerParser(options: {
  onLiteral?: (literal: string) => void | Promise<void>
  onSpecial?: (special: string) => void | Promise<void>
  /**
   * The minimum length of text required to emit a literal part.
   * Useful for avoiding emitting literal parts too fast.
   */
  minLiteralEmitLength?: number
}) {
  const minLiteralEmitLength = Math.max(1, options.minLiteralEmitLength ?? 1)
  let buffer = ''
  let inTag = false

  return {
    /**
     * Consumes a chunk of text from the stream.
     * It processes the internal buffer to find and emit complete literal and special parts.
     * Incomplete parts are kept in the buffer to be processed with the next chunk.
     * @param textPart The chunk of text to consume.
     */
    async consume(textPart: string) {
      buffer += textPart

      while (buffer.length > 0) {
        if (!inTag) {
          const openTagIndex = buffer.indexOf(TAG_OPEN)
          if (openTagIndex < 0) {
            if (buffer.length - 1 >= minLiteralEmitLength) {
              const emit = buffer.slice(0, -1)
              buffer = buffer[buffer.length - 1]
              await options.onLiteral?.(emit)
            }
            break
          }

          if (openTagIndex > 0) {
            const emit = buffer.slice(0, openTagIndex)
            buffer = buffer.slice(openTagIndex)
            await options.onLiteral?.(emit)
          }
          inTag = true
        }
        else {
          const closeTagIndex = buffer.indexOf(TAG_CLOSE)
          if (closeTagIndex < 0) {
            break
          }

          const emit = buffer.slice(0, closeTagIndex + TAG_CLOSE.length)
          buffer = buffer.slice(closeTagIndex + TAG_CLOSE.length)
          await options.onSpecial?.(emit)
          inTag = false
        }
      }
    },

    /**
     * Finalizes the parsing process.
     * Any remaining content in the buffer is flushed as a final literal part.
     * This should be called after the stream has ended.
     */
    async end() {
      // Incomplete tag should not be emitted as literals.
      if (!inTag && buffer.length > 0) {
        await options.onLiteral?.(buffer)
        buffer = ''
      }
    },
  }
}
