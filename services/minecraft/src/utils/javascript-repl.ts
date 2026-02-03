import { inspect } from 'node:util'
import vm from 'node:vm'

interface JavaScriptReplOptions {
  timeoutMs?: number
}

export class JavaScriptRepl {
  private readonly context: vm.Context
  private readonly timeoutMs: number

  constructor(options: JavaScriptReplOptions = {}) {
    this.timeoutMs = options.timeoutMs ?? 500
    this.context = vm.createContext({})
  }

  public evaluate(code: string): string {
    const script = new vm.Script(code)
    const result = script.runInContext(this.context, { timeout: this.timeoutMs })

    if (result === undefined)
      return 'undefined'

    return typeof result === 'string'
      ? result
      : inspect(result, { depth: 4, maxArrayLength: 100, breakLength: 120 })
  }
}

export const javascriptRepl = new JavaScriptRepl()
