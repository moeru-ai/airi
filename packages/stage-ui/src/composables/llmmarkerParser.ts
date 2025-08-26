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
}) {
  let buffer = ''
  const tagRegex = /(<\|.*?\|>)/

  return {
    /**
     * Consumes a chunk of text from the stream.
     * It processes the internal buffer to find and emit complete literal and special parts.
     * Incomplete parts are kept in the buffer to be processed with the next chunk.
     * @param textPart The chunk of text to consume.
     */
    async consume(textPart: string) {
      buffer += textPart

      // The regex splits the buffer by tags, keeping the tags in the result array.
      const parts = buffer.split(tagRegex)

      // The last element of the array is the remainder of the string after the last
      // complete tag. It could be a partial literal or a partial tag. We keep it
      // in the buffer for the next consume call.
      const processableParts = parts.slice(0, -1)
      buffer = parts[parts.length - 1] || ''

      for (const part of processableParts) {
        if (!part)
          continue // Skip empty strings that can result from the split.

        // Check if the part is a tag or a literal.
        if (tagRegex.test(part)) {
          // Extract the content from inside the tag and pass it to the callback.
          const specialContent = part.slice(2, -2)
          await options.onSpecial?.(specialContent)
        }
        else {
          await options.onLiteral?.(part)
        }
      }
    },

    /**
     * Finalizes the parsing process.
     * Any remaining content in the buffer is flushed as a final literal part.
     * This should be called after the stream has ended.
     */
    async end() {
      if (buffer) {
        await options.onLiteral?.(buffer)
        buffer = ''
      }
    },
  }
}
