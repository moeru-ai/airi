import { array, literal, looseObject, parseJson, pipe, safeParse, string, unknown } from 'valibot'

/**
 * One AUV call as the AUV CLI reads its argv.
 *
 * This module is the one place that knows the argument rules of the CLI. The readers of the cards take an invocation, not an argv.
 */
export interface ComputerUseInvocation {
  command: string
  positional: string[]
  /** Every value of each flag, in order. A flag can repeat. */
  flags: Record<string, string[]>
}

/** AUV CLI flags that take no value. Every other flag takes the token after it. */
const VALUELESS_FLAGS = new Set(['--normalized', '--dry-run', '--no-overlay', '--json', '--detail', '--wide'])

/**
 * Reads the argv of an AUV call. `argv[0]` is `invoke`, and `argv[1]` is the command.
 * Every token after `--` is positional, even one that starts with `--`.
 *
 * @example
 * parseInvocation(['invoke', 'input.clickPoint', '10', '20', '--modifiers', 'shift', '--modifiers', 'cmd'])
 * // => { command: 'input.clickPoint', positional: ['10', '20'], flags: { '--modifiers': ['shift', 'cmd'] } }
 */
export function parseInvocation(argv: string[]): ComputerUseInvocation {
  const positional: string[] = []
  const flags: Record<string, string[]> = {}
  for (let index = 2; index < argv.length; index++) {
    const token = argv[index]!
    if (token === '--') {
      positional.push(...argv.slice(index + 1))
      break
    }
    if (!token.startsWith('--')) {
      positional.push(token)
      continue
    }
    const separator = token.indexOf('=')
    const flag = separator === -1 ? token : token.slice(0, separator)
    const next = argv[index + 1]
    let value: string
    if (separator !== -1)
      value = token.slice(separator + 1)
    else if (VALUELESS_FLAGS.has(flag) || next === undefined || next.startsWith('--'))
      value = 'true'
    else
      value = argv[++index]!
    const values = flags[flag] ?? []
    values.push(value)
    flags[flag] = values
  }
  return { command: argv[1] ?? '', positional, flags }
}

/** The value that a flag ends with. A flag given more than once takes its last value, as in AUV. */
export function lastFlag(invocation: ComputerUseInvocation, flag: string) {
  return invocation.flags[flag]?.at(-1)
}

/** Every item of a flag that can repeat, where each value can also list items with commas, such as `--modifiers`. */
export function listFlag(invocation: ComputerUseInvocation, flag: string) {
  return invocation.flags[flag]?.flatMap(value => value.split(',')) ?? []
}

/** One step that `input.keyboard` was asked to run. */
export type ComputerUseKeyboardSpec = { kind: 'press', keys: string[] } | { kind: 'type_text', text: string } | { kind: 'other', text: string }

/** The steps that `input.keyboard` was asked to run, from its `--actions` JSON. */
export function keyboardSpecs(invocation: ComputerUseInvocation): ComputerUseKeyboardSpec[] {
  const specs = safeParse(pipe(string(), parseJson(), array(unknown())), lastFlag(invocation, '--actions'))
  if (!specs.success)
    return []
  return specs.output.map((spec) => {
    const press = safeParse(looseObject({ kind: literal('press'), keys: array(string()) }), spec)
    if (press.success)
      return { kind: 'press', keys: press.output.keys }
    const type = safeParse(looseObject({ kind: literal('type_text'), text: string() }), spec)
    if (type.success)
      return { kind: 'type_text', text: type.output.text }
    return { kind: 'other', text: JSON.stringify(spec) }
  })
}
