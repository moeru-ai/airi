import { describe, expect, it } from 'vitest'

import { JavaScriptRepl } from './javascript-repl'

describe('javascript-repl', () => {
  it('persists variables between eval calls', () => {
    const repl = new JavaScriptRepl()

    repl.evaluate('const var_foo = 6 * 7')

    expect(repl.evaluate('var_foo')).toBe('42')
  })

  it('times out long-running scripts', () => {
    const repl = new JavaScriptRepl({ timeoutMs: 20 })

    expect(() => repl.evaluate('while (true) {}')).toThrow(/Script execution timed out/i)
  })
})
