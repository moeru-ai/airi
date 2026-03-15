import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { env } from 'node:process'
import { fileURLToPath } from 'node:url'

export interface BrowserAgentTaskInput {
  instruction: string
  agent?: 'google' | 'kimi'
  cdpUrl?: string
  maxTurns?: number
  timeoutMs?: number
}

export interface BrowserAgentLaunchContext {
  cdpUrl: string
  cliCwd: string
  cliModule: string
  pythonCommand: string
  rootExists: boolean
}

export interface BrowserAgentTaskResult {
  success: boolean
  instruction: string
  agent: 'google' | 'kimi'
  cdpUrl: string
  cliCwd: string
  cliModule: string
  pythonCommand: string
  exitCode: number | null
  timedOut: boolean
  stderrLines: string[]
  payload?: Record<string, unknown>
}

const computerUseRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../bin/computer_use')
const cliModule = 'google_computer_use.cli'

function trimNonEmptyLines(text: string) {
  return text
    .split(/\r?\n/u)
    .map(line => line.trim())
    .filter(Boolean)
}

function resolvePythonCommand(root: string) {
  const configured = env.COMPUTER_USE_PYTHON?.trim()
  if (configured) {
    return configured
  }

  const venvPython = resolve(root, '.venv', 'bin', 'python')
  if (existsSync(venvPython)) {
    return venvPython
  }

  return 'python3'
}

export function getBrowserAgentLaunchContext(overrides?: {
  cdpUrl?: string
}): BrowserAgentLaunchContext {
  const cliCwd = env.COMPUTER_USE_BROWSER_AGENT_ROOT?.trim()
    ? resolve(env.COMPUTER_USE_BROWSER_AGENT_ROOT)
    : computerUseRoot

  return {
    cdpUrl: overrides?.cdpUrl?.trim() || env.CDP_URL?.trim() || 'http://localhost:9222',
    cliCwd,
    cliModule,
    pythonCommand: resolvePythonCommand(cliCwd),
    rootExists: existsSync(cliCwd),
  }
}

export async function runBrowserAgentTask(input: BrowserAgentTaskInput): Promise<BrowserAgentTaskResult> {
  const instruction = input.instruction.trim()
  if (!instruction) {
    throw new Error('browser agent requires a non-empty instruction')
  }

  const agent = input.agent || 'google'
  const maxTurns = Math.max(1, Math.min(input.maxTurns || 30, 80))
  const timeoutMs = Math.max(1_000, Math.min(input.timeoutMs || 180_000, 900_000))
  const launchContext = getBrowserAgentLaunchContext({ cdpUrl: input.cdpUrl })

  if (!launchContext.rootExists) {
    throw new Error(`browser agent root does not exist: ${launchContext.cliCwd}`)
  }

  return await new Promise<BrowserAgentTaskResult>((resolvePromise, rejectPromise) => {
    const child = spawn(launchContext.pythonCommand, ['-m', launchContext.cliModule], {
      cwd: launchContext.cliCwd,
      env: {
        ...env,
        CDP_URL: launchContext.cdpUrl,
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    let stdout = ''
    let stderr = ''
    let settled = false
    let timedOut = false

    const timeoutHandle = setTimeout(() => {
      timedOut = true
      child.kill('SIGTERM')
      setTimeout(() => {
        if (child.exitCode == null) {
          child.kill('SIGKILL')
        }
      }, 1_500)
    }, timeoutMs)

    const finish = (callback: () => void) => {
      if (settled) {
        return
      }

      settled = true
      clearTimeout(timeoutHandle)
      callback()
    }

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString('utf-8')
    })

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString('utf-8')
    })

    child.once('error', (error) => {
      finish(() => {
        rejectPromise(error)
      })
    })

    child.once('close', (code) => {
      finish(() => {
        const stdoutLines = trimNonEmptyLines(stdout)
        const stderrLines = trimNonEmptyLines(stderr)
        const rawPayload = stdoutLines.at(-1)

        let payload: Record<string, unknown> | undefined
        if (rawPayload) {
          try {
            const parsed = JSON.parse(rawPayload) as unknown
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
              payload = parsed as Record<string, unknown>
            }
          }
          catch {
            // Ignore parse failure here; the caller still gets stderr and exit code.
          }
        }

        if (!payload && code !== 0) {
          rejectPromise(new Error(stderrLines.at(-1) || `browser agent exited with code ${String(code)}`))
          return
        }

        resolvePromise({
          success: Boolean(payload?.success),
          instruction,
          agent,
          cdpUrl: launchContext.cdpUrl,
          cliCwd: launchContext.cliCwd,
          cliModule: launchContext.cliModule,
          pythonCommand: launchContext.pythonCommand,
          exitCode: code,
          timedOut,
          stderrLines,
          payload,
        })
      })
    })

    child.stdin.write(`${JSON.stringify({
      instruction,
      agent,
      cdp_url: launchContext.cdpUrl,
      max_turns: maxTurns,
    })}\n`)
    child.stdin.end()
  })
}
