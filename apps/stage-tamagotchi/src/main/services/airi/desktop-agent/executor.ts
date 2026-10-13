import { isInsidePath, relativeToWorkspace as relativePath, resolvePath } from './path'

/**
 * The desktop agent executor.
 *
 * Three gates run in this order, and the order matters:
 *
 * 1. The command policy reads the program and its arguments, because a
 *    whitelisted program can still be asked to run arbitrary code.
 * 2. The workspace boundary resolves every path and refuses anything outside
 *    the workspace root.
 * 3. The permission layer asks the user. It runs in the caller, before the
 *    executor is reached, so a denied call never arrives here.
 *
 * The executor never reaches the operating system directly. It calls the
 * injected {@link DesktopAgentBridge}, which the host implements. That keeps the
 * policy testable without a real filesystem and keeps the host in charge of the
 * machine.
 */

/** The programs the agent may run. Anything else is refused. */
export const COMMAND_WHITELIST = [
  'node',
  'npm',
  'npx',
  'git',
  'pnpm',
  'yarn',
  'python',
  'python3',
  'py',
  'pip',
  'uv',
  'cargo',
  'go',
  'dotnet',
  'java',
  'mvn',
  'gradle',
  'rg',
  'ls',
  'dir',
  'cat',
  'type',
  'echo',
  'where',
  'which',
]

/**
 * Argument shapes that turn a whitelisted program into an arbitrary one.
 *
 * `-c` is deliberately absent. `pip -c` and `gradle -c` are ordinary flags, and
 * blocking them would break real work for no gain.
 */
export const ARG_PATTERNS: Array<{ re: RegExp, why: string }> = [
  { re: /^-{1,2}(e|exec|eval)([=:].*)?$/i, why: 'the argument can execute arbitrary code' },
  { re: /^-{1,2}(command|prefix)$/i, why: 'the argument can replace the program that runs' },
  { re: /^-{1,2}(global|g)$/i, why: 'the argument changes the global environment' },
  { re: /^-{1,2}(force|f)$/i, why: 'force mode carries too much risk' },
  { re: /\bnpm\s+(i|install|add)\b/i, why: 'an install runs the package postinstall scripts' },
]

/** The result of the command policy. */
export type CommandCheck = { ok: true } | { ok: false, code: string, why: string }

/** Reduces a program name or path to its bare name, lower case and without an extension. */
function baseName(command: string): string {
  const value = String(command ?? '').trim()
  const parts = value.split(/[\\/]/)
  return (parts[parts.length - 1] ?? '').replace(/\.(exe|cmd|bat|ps1)$/i, '').toLowerCase()
}

/**
 * Applies the command policy to one program and its arguments.
 *
 * The arguments are never joined into a command line, so a shell operator is a
 * refusal rather than an instruction.
 */
export function checkCommand(command: string, args?: unknown): CommandCheck {
  const base = baseName(command)
  if (!base)
    return { ok: false, code: 'NO_COMMAND', why: 'no program was given' }

  if (/\.(?:bat|cmd|ps1|vbs|js)$/i.test(String(command)))
    return { ok: false, code: 'SCRIPT_FILE', why: 'a script file cannot run directly. Use node, npm, or another interpreter.' }

  if (!COMMAND_WHITELIST.includes(base))
    return { ok: false, code: 'NOT_WHITELISTED', why: `the program "${base}" is not on the allow list` }

  const list = Array.isArray(args) ? args.map(value => String(value)) : []
  for (const arg of list) {
    if (/[\r\n\0]/.test(arg))
      return { ok: false, code: 'BAD_ARG', why: 'an argument holds a line break or a null character' }

    if (/[;&|`$><]/.test(arg))
      return { ok: false, code: 'SHELL_META', why: `an argument holds a shell operator: ${arg.slice(0, 40)}` }

    for (const pattern of ARG_PATTERNS) {
      if (pattern.re.test(arg))
        return { ok: false, code: 'DANGEROUS_ARG', why: `${pattern.why} (${arg})` }
    }
  }

  if (base === 'git' && list[0] === 'push')
    return { ok: false, code: 'GIT_PUSH', why: 'git push is refused here' }

  return { ok: true }
}

/**
 * Resolves a target against the workspace and refuses anything outside it.
 *
 * An absolute path, a `..` segment, and a null byte are all refusals, so the
 * model cannot walk out of the workspace with a crafted path.
 */
export function resolveInsideWorkspace(workspace: string, target: unknown): string {
  const root = String(workspace ?? '').trim()
  if (!root)
    throw new Error('The agent workspace is not set.')

  if (typeof target !== 'string')
    throw new Error('A path must be a string.')

  const raw = target.trim() === '' ? '.' : target.trim()
  if (raw.includes('\0'))
    throw new Error('The path holds a null character.')

  const absolute = resolvePath(root, raw)
  if (!isInsidePath(absolute, root)) {
    const error = new Error(`The path leaves the workspace: ${raw}`)
    Object.assign(error, { code: 'OUTSIDE_WORKSPACE' })
    throw error
  }

  return absolute
}

/** Merges the caller's cancellation signal with a timeout. */
export function withTimeout(signal: AbortSignal | undefined, timeoutMs: number) {
  const controller = new AbortController()
  const ms = Math.max(0, Number(timeoutMs) || 0)
  let timer: ReturnType<typeof setTimeout> | undefined
  let timedOut = false

  const onAbort = () => controller.abort()
  if (signal) {
    if (signal.aborted)
      controller.abort()
    else
      signal.addEventListener('abort', onAbort, { once: true })
  }
  if (ms > 0) {
    timer = setTimeout(() => {
      timedOut = true
      controller.abort()
    }, ms)
  }

  return {
    signal: controller.signal,
    didTimeout: () => timedOut,
    cleanup() {
      if (timer)
        clearTimeout(timer)
      if (signal)
        signal.removeEventListener('abort', onAbort)
    },
  }
}

/**
 * The machine access the host provides.
 *
 * `readdir` reports `isDirectory` as a boolean field because a `Dirent` method
 * does not survive IPC.
 */
export interface DesktopAgentBridge {
  readdir: (path: string) => Promise<Array<{ name: string, isDirectory: boolean }>>
  readFile: (path: string) => Promise<string>
  writeFile: (path: string, text: string) => Promise<void>
  spawn: (options: { command: string, args: string[], cwd: string, timeoutMs: number }) => Promise<{
    done: Promise<{ exitCode: number, stdout: string, stderr: string, timedOut: boolean }>
    cancel: () => void
  }>
  screenCapture: (options: { withData: boolean }) => Promise<unknown>
  windowList: () => Promise<string[]>
  windowFocus: (options: { title: string }) => Promise<{ text?: string } | undefined>
  openApplication: (options: { target: string, isUrl: boolean }) => Promise<{ text?: string } | undefined>
  cursor?: () => Promise<{ x: number, y: number, scale: number } | null>
  mouseMove: (options: { x: number, y: number }) => Promise<void>
  mouseClick: (options: { button: 'left' | 'right' | 'middle', double: boolean }) => Promise<void>
  keyboardType: (options: { text: string }) => Promise<void>
  keyboardPress: (options: { keys: string[] }) => Promise<void>
}

/** What {@link createExecutor} returns. The tool names are part of the contract. */
export interface DesktopAgentExecutor {
  workspace: string
  runningCount: () => number
  cancelAll: () => number
  list_files: (input?: { path?: string, depth?: number }) => Promise<string>
  search_files: (input: { query: string, path?: string, maxResults?: number }) => Promise<string>
  read_file: (input: { path: string, offset?: number, limit?: number }) => Promise<string>
  write_file: (input: { path: string, content: string }) => Promise<string>
  apply_patch: (input: { path: string, old: string, new: string }) => Promise<string>
  run_command: (input: { command: string, args?: string[], timeoutMs?: number }) => Promise<string>
  screen_capture: (input?: { withData?: boolean }) => Promise<unknown>
  window_list: () => Promise<string>
  window_focus: (input: { title: string }) => Promise<string>
  open_application: (input: { target: string }) => Promise<string>
  mouse_move: (input: { x: number, y: number }) => Promise<string>
  mouse_click: (input?: { button?: string, double?: boolean }) => Promise<string>
  keyboard_type: (input: { text: string }) => Promise<string>
  keyboard_press: (input: { keys: string[] }) => Promise<string>
}

/** The file extensions `search_files` reads. A binary or an asset is skipped. */
const SEARCHABLE = /\.(?:js|mjs|cjs|json|md|txt|yml|yaml|html|css|ts|ps1|bat)$/i

/** The directories `search_files` does not descend into. */
const SEARCH_SKIP = new Set(['.git', 'node_modules', 'dist', 'release', '.vite'])

/**
 * Builds the executor.
 *
 * The workspace is the only folder the file tools reach. The bridge carries the
 * machine access, and `isSensitive` reports a path the agent must not touch,
 * such as a credential file.
 */
export function createExecutor(deps: { workspace: string, bridge: DesktopAgentBridge, isSensitive?: (absolutePath: string) => boolean }): DesktopAgentExecutor {
  const workspace = String(deps?.workspace ?? '')
  const bridge = deps?.bridge
  const isSensitive = typeof deps?.isSensitive === 'function' ? deps.isSensitive : () => false
  const running = new Set<{ cancel: () => void }>()

  function need(name: keyof DesktopAgentBridge): void {
    if (typeof bridge?.[name] !== 'function')
      throw new Error(`The host does not provide this capability: ${String(name)}`)
  }

  function guard(target: unknown): string {
    return resolveInsideWorkspace(workspace, target)
  }

  function denySensitive(absolute: string): void {
    if (!isSensitive(absolute))
      return

    const error = new Error('The path holds credentials or settings, so the agent cannot read or write it.')
    Object.assign(error, { code: 'SENSITIVE_PATH' })
    throw error
  }

  function relativeToWorkspace(absolute: string): string {
    return relativePath(workspace, absolute)
  }

  /** Renders a directory tree. The depth keeps a deep folder from flooding the result. */
  async function listFiles(input: { path?: string, depth?: number } = {}): Promise<string> {
    const start = String(input.path ?? '.')
    const absolute = guard(start)
    denySensitive(absolute)
    need('readdir')

    const maxDepth = Math.max(1, Math.min(6, Number(input.depth) || 1))
    const lines: string[] = []
    const prefix = start === '.' ? '' : `${start.replace(/\\/g, '/')}/`

    async function walk(directory: string, level: number, path: string): Promise<void> {
      if (level > maxDepth || lines.length > 800)
        return

      const entries = await bridge.readdir(directory)
      for (const entry of entries) {
        if (lines.length > 800)
          return
        const isDirectory = entry.isDirectory === true
        if (entry.name === '.git' || entry.name === 'node_modules') {
          lines.push(`${path}${entry.name}/ (contents skipped)`)
          continue
        }

        lines.push(`${path}${entry.name}${isDirectory ? '/' : ''}`)
        if (isDirectory && level < maxDepth)
          await walk(resolvePath(directory, entry.name), level + 1, `${path}${entry.name}/`)
      }
    }

    await walk(absolute, 1, prefix)
    return lines.slice(0, 800).join('\n')
  }

  /** Finds a literal string in the searchable files under one directory. */
  async function searchFiles(input: { query: string, path?: string, maxResults?: number }): Promise<string> {
    const needle = String(input.query ?? '')
    if (!needle)
      throw new Error('search_files needs a query.')

    const absolute = guard(String(input.path ?? '.'))
    denySensitive(absolute)
    need('readdir')
    need('readFile')

    const limit = Math.max(1, Math.min(200, Number(input.maxResults) || 50))
    const hits: string[] = []

    async function walk(directory: string, level: number): Promise<void> {
      if (hits.length >= limit || level > 6)
        return

      const entries = await bridge.readdir(directory).catch(() => [])
      for (const entry of entries) {
        if (hits.length >= limit)
          return

        if (entry.isDirectory === true) {
          if (SEARCH_SKIP.has(entry.name))
            continue
          await walk(resolvePath(directory, entry.name), level + 1)
          continue
        }

        if (!SEARCHABLE.test(entry.name))
          continue

        const file = resolvePath(directory, entry.name)
        const text = await bridge.readFile(file).catch(() => '')
        if (!text)
          continue

        const lines = String(text).split('\n')
        for (let index = 0; index < lines.length && hits.length < limit; index += 1) {
          if (lines[index].includes(needle))
            hits.push(`${relativeToWorkspace(file)}:${index + 1}: ${lines[index].trim().slice(0, 200)}`)
        }
      }
    }

    await walk(absolute, 1)
    return hits.length > 0 ? hits.join('\n') : `Nothing under the workspace contains "${needle}".`
  }

  /** Reads a text file with line numbers, because the model edits by line. */
  async function readFile(input: { path: string, offset?: number, limit?: number }): Promise<string> {
    const absolute = guard(input.path)
    denySensitive(absolute)
    need('readFile')

    const text = String(await bridge.readFile(absolute) ?? '')
    const lines = text.split('\n')
    const start = Math.max(1, Number(input.offset) || 1)
    const count = Math.max(1, Math.min(2000, Number(input.limit) || 400))
    const slice = lines.slice(start - 1, start - 1 + count)
    const numbered = slice
      .map((line, index) => `${String(start + index).padStart(5, ' ')}| ${line}`)
      .join('\n')

    const remaining = start - 1 + count < lines.length
      ? `\n… the file holds ${lines.length} lines in total.`
      : ''

    return numbered + remaining
  }

  /** Writes a whole file. The user confirms this call before it arrives. */
  async function writeFile(input: { path: string, content: string }): Promise<string> {
    const absolute = guard(input.path)
    denySensitive(absolute)
    need('writeFile')

    const text = String(input.content ?? '')
    await bridge.writeFile(absolute, text)
    return `Wrote ${relativeToWorkspace(absolute)} (${text.length} characters).`
  }

  /**
   * Replaces one exact piece of text.
   *
   * The old text must occur exactly once, because a partial replacement of a
   * repeated string silently edits the wrong place.
   */
  async function applyPatch(input: { path: string, old: string, new: string }): Promise<string> {
    const absolute = guard(input.path)
    denySensitive(absolute)
    need('readFile')
    need('writeFile')

    const source = String(input.old ?? '')
    if (!source)
      throw new Error('apply_patch needs the text to replace.')

    const text = String(await bridge.readFile(absolute) ?? '')
    const first = text.indexOf(source)
    if (first < 0)
      throw new Error(`The text to replace is not in ${relativeToWorkspace(absolute)}.`)

    if (text.includes(source, first + source.length))
      throw new Error('The text to replace occurs more than once. Give a longer, unique piece of context.')

    const next = text.slice(0, first) + String(input.new ?? '') + text.slice(first + source.length)
    await bridge.writeFile(absolute, next)
    return `Patched ${relativeToWorkspace(absolute)} (replaced ${source.length} characters).`
  }

  /** Runs one program in the workspace root. */
  async function runCommand(input: { command: string, args?: string[], timeoutMs?: number }): Promise<string> {
    const check = checkCommand(input.command, input.args)
    if (!check.ok) {
      const error = new Error(`The command policy refused this call: ${check.why}`)
      Object.assign(error, { code: check.code })
      throw error
    }

    need('spawn')
    const timeoutMs = Math.max(1000, Math.min(600000, Number(input.timeoutMs) || 60_000))
    const handle = await bridge.spawn({
      command: String(input.command),
      args: (Array.isArray(input.args) ? input.args : []).map(value => String(value)),
      cwd: workspace,
      timeoutMs,
    })

    running.add(handle)
    try {
      const result = await handle.done
      const parts: string[] = []
      if (result.stdout)
        parts.push(result.stdout)
      if (result.stderr)
        parts.push(`[stderr]\n${result.stderr}`)
      parts.push(`(exit code ${result.exitCode}${result.timedOut ? ', stopped by the timeout' : ''})`)
      return parts.join('\n')
    }
    finally {
      running.delete(handle)
    }
  }

  return {
    workspace,
    runningCount: () => running.size,
    cancelAll() {
      let count = 0
      for (const handle of Array.from(running)) {
        try {
          handle.cancel()
          count += 1
        }
        catch {
          // A handle that already finished cannot be cancelled, and that is not
          // an error worth reporting to the caller.
        }
      }
      return count
    },
    list_files: listFiles,
    search_files: searchFiles,
    read_file: readFile,
    write_file: writeFile,
    apply_patch: applyPatch,
    run_command: runCommand,
    async screen_capture(input = {}) {
      need('screenCapture')
      return await bridge.screenCapture({ withData: input.withData === true })
    },
    async window_list() {
      need('windowList')
      const list = await bridge.windowList()
      if (!Array.isArray(list) || list.length === 0)
        return 'No window reports a title.'

      return list.map((title, index) => `${index + 1}. ${title}`).join('\n')
    },
    async window_focus(input) {
      const title = String(input.title ?? '').trim()
      if (!title)
        throw new Error('window_focus needs a title.')

      need('windowFocus')
      const result = await bridge.windowFocus({ title })
      return result?.text ?? `Focused the window matching "${title}".`
    },
    async open_application(input) {
      const target = String(input.target ?? '').trim()
      if (!target)
        throw new Error('open_application needs a target.')

      // A URL or a short program name only. A path or an argument list would let
      // the model start any program with flags of its choosing.
      const isUrl = /^https?:\/\//i.test(target)
      if (!isUrl && !/^[\w .-]{1,80}$/.test(target))
        throw new Error('open_application takes an http(s) address or a program name, without a path or arguments.')

      need('openApplication')
      const result = await bridge.openApplication({ target, isUrl })
      return result?.text ?? `Opened ${target}.`
    },
    async mouse_move(input) {
      const logicalX = Math.round(Number(input.x))
      const logicalY = Math.round(Number(input.y))
      if (!Number.isFinite(logicalX) || !Number.isFinite(logicalY))
        throw new Error('mouse_move needs numeric x and y coordinates.')

      need('mouseMove')
      // The screen capture and the model work in logical pixels, and the input
      // call takes physical ones. Without the scale, a click lands off target on
      // a display that is not at 100%.
      const pointer = typeof bridge.cursor === 'function' ? await bridge.cursor() : null
      const scale = Number(pointer?.scale) || 1
      const physicalX = Math.round(logicalX * scale)
      const physicalY = Math.round(logicalY * scale)
      await bridge.mouseMove({ x: physicalX, y: physicalY })

      const note = scale === 1 ? '' : ` (logical ${logicalX}, ${logicalY} times the ${scale}x scale)`
      return `Moved the pointer to (${physicalX}, ${physicalY})${note}.`
    },
    async mouse_click(input = {}) {
      const button = String(input.button ?? 'left').toLowerCase()
      if (button !== 'left' && button !== 'right' && button !== 'middle')
        throw new Error('mouse_click takes left, right, or middle.')

      need('mouseClick')
      await bridge.mouseClick({ button, double: input.double === true })
      return `Clicked the ${button} button${input.double === true ? ' twice' : ''}.`
    },
    async keyboard_type(input) {
      const text = String(input.text ?? '')
      if (!text)
        throw new Error('keyboard_type needs text.')
      if (text.length > 2000)
        throw new Error('keyboard_type types at most 2000 characters at a time.')

      need('keyboardType')
      await bridge.keyboardType({ text })
      return `Typed ${text.length} characters.`
    },
    async keyboard_press(input) {
      const keys = Array.isArray(input.keys) ? input.keys.map(value => String(value)) : []
      if (keys.length === 0)
        throw new Error('keyboard_press needs a list of keys, such as ["ctrl","c"].')

      need('keyboardPress')
      await bridge.keyboardPress({ keys })
      return `Pressed ${keys.join('+')}.`
    },
  }
}
