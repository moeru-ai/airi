import type { Message } from '../define/types/mes_example'

function prefixAndSuffix<T extends string = string>(prefix: string, suffix: string = prefix) {
  return (str: string | string[] | TemplateStringsArray, ...substitutions: unknown[]): T =>
    `${prefix}${
      substitutions.length > 0
        ? String.raw(str as TemplateStringsArray, substitutions)
        : Array.isArray(str)
          ? str.join(' ')
          : str
    }${suffix}` as T
}

/**
 * Generate action string.
 *
 * @example
 * ```ts
 * const world = 'World'
 * const foo = action`Hello, ${world}!` // `*Hello, World!*`
 * const bar = action('What is love?') // '*What is love?*'
 * const baz = action(['lorem,', 'ipsum']) // '*lorem, ipsum*'
 * ```
 */
export const action = prefixAndSuffix('*')

/**
 * Generate message string.
 *
 * @example
 * ```ts
 * const world = 'World'
 * const foo = message`Hello, ${world}!` // `"Hello, World!"`
 * const bar = message('What is love?') // '"What is love?"'
 * const baz = message(['lorem,', 'ipsum']) // '"lorem, ipsum"'
 * ```
 */
export const message = prefixAndSuffix('"')

/**
 * Generate message example.
 * @param content message content
 * @returns message example
 * @example
 * ```ts
 * const bar = char('hello') // '{{char}}: hello'
 * ```
 */
export const char = prefixAndSuffix<Message>('{{char}}: ', '')

/**
 * Generate message example.
 * @param content message content
 * @returns message example
 * @example
 * ```ts
 * const foo = user('hi') // '{{user}}: hi'
 * ```
 */
export const user = prefixAndSuffix<Message>('{{user}}: ', '')

export {
  action as act,
  message as msg,
}
