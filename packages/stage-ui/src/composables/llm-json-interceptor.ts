export interface LlmJsonInterceptorOptions {
  onText: (text: string) => void | Promise<void>
  onJson: (json: any, raw: string) => void | Promise<void>
}

/**
 * Intercepts fenced JSON-like blocks from streamed LLM output while passing
 * normal text through immediately.
 */
export function createLlmJsonInterceptor(options: LlmJsonInterceptorOptions) {
  let buffer = ''
  let inBlock = false
  let currentBlockType: 'json' | 'generic' | null = null

  const JSON_BLOCK_START = '```json'
  const GENERIC_BLOCK_START = '```'
  const BLOCK_END = '```'

  return {
    async consume(chunk: string) {
      buffer += chunk

      while (buffer.length > 0) {
        if (!inBlock) {
          const jsonIdx = buffer.indexOf(JSON_BLOCK_START)
          const genericIdx = buffer.indexOf(GENERIC_BLOCK_START)

          const lastBacktickIdx = buffer.lastIndexOf('`')
          if (lastBacktickIdx !== -1 && lastBacktickIdx > buffer.length - 8) {
            const tail = buffer.slice(lastBacktickIdx)
            if (JSON_BLOCK_START.startsWith(tail) || GENERIC_BLOCK_START.startsWith(tail)) {
              const emitText = buffer.slice(0, lastBacktickIdx)
              if (emitText)
                await options.onText(emitText)
              buffer = tail
              break
            }
          }

          if (jsonIdx === -1 && genericIdx === -1) {
            await options.onText(buffer)
            buffer = ''
            break
          }

          let startIdx = -1
          let type: 'json' | 'generic' = 'generic'

          if (jsonIdx !== -1 && (genericIdx === -1 || jsonIdx <= genericIdx)) {
            startIdx = jsonIdx
            type = 'json'
          }
          else {
            startIdx = genericIdx
            type = 'generic'
          }

          if (startIdx > 0) {
            await options.onText(buffer.slice(0, startIdx))
            buffer = buffer.slice(startIdx)
          }

          inBlock = true
          currentBlockType = type
        }
        else {
          const startMarker = currentBlockType === 'json' ? JSON_BLOCK_START : GENERIC_BLOCK_START
          const endIdx = buffer.indexOf(BLOCK_END, startMarker.length)

          if (endIdx === -1)
            break

          const fullBlock = buffer.slice(0, endIdx + BLOCK_END.length)
          const content = buffer.slice(startMarker.length, endIdx).trim()

          let handled = false
          if (currentBlockType === 'json' || (content.startsWith('{') && content.endsWith('}'))) {
            try {
              const parsed = JSON.parse(content)
              if (parsed && typeof parsed === 'object' && ('component' in parsed || 'componentName' in parsed || ('action' in parsed && 'id' in parsed))) {
                await options.onJson(parsed, fullBlock)
                handled = true
              }
            }
            catch {
              // Not valid JSON, fall through to text emission.
            }
          }

          if (!handled)
            await options.onText(fullBlock)

          buffer = buffer.slice(endIdx + BLOCK_END.length)
          inBlock = false
          currentBlockType = null
        }
      }
    },

    async end() {
      if (buffer) {
        await options.onText(buffer)
        buffer = ''
      }
      inBlock = false
      currentBlockType = null
    },
  }
}
