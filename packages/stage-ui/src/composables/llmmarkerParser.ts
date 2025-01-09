enum States {
  Literal = 'literal',
  Special = 'special',
}

function peek(array: string, index: number, offset: number): string | undefined {
  if (index + offset < 0 || index + offset >= (array.length - 1))
    return ''

  return array[index + offset]
}

export function useLlmmarkerParser(options: {
  onLiteral?: (literal: string) => void | Promise<void>
  onSpecial?: (special: string) => void | Promise<void>
}) {
  let state = States.Literal
  let buffer = ''

  return {
    async consume(textPart: string) {
      for (let i = 0; i < textPart.length; i++) {
        let current = textPart[i]
        let newState: States = state

        // read
        if (current === '<' && peek(textPart, i, 1) === '|') {
          current += peek(textPart, i, 1)
          newState = States.Special
          i++
        }
        else if (current === '|' && peek(textPart, i, 1) === '>') {
          current += peek(textPart, i, 1)
          newState = States.Literal
          i++
        }
        else if (current === '<') {
          newState = States.Special
        }
        else if (current === '>') {
          newState = States.Literal
        }

        // handle
        if (state === States.Literal && newState === States.Special) {
          if (buffer !== '') {
            await options.onLiteral?.(buffer)
            buffer = ''
          }
        }
        else if (state === States.Special && newState === States.Literal) {
          if (buffer !== '') {
            buffer += current
            await options.onSpecial?.(buffer)
            buffer = '' // Clear buffer when exiting Special state
          }
        }

        if (state === States.Literal && newState === States.Literal) {
          await options.onLiteral?.(current)
          buffer = ''
        }
        else if (state === States.Special && newState === States.Literal) {
          buffer = ''
        }
        else {
          buffer += current
        }

        state = newState
      }
    },
    async end() {
      if (buffer !== '') {
        if (state === States.Literal) {
          await options.onLiteral?.(buffer)
        }
        else {
          if (buffer.endsWith('|>')) {
            await options.onSpecial?.(buffer)
          }
        }
      }
    },
  }
}
