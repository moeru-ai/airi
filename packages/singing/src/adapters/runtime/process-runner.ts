import process from 'node:process'

import { Buffer } from 'node:buffer'
import { spawn } from 'node:child_process'

/**
 * Generic child process runner for invoking Python scripts.
 */
export interface ProcessRunnerOptions {
  cwd?: string
  env?: Record<string, string>
  signal?: AbortSignal
  timeoutMs?: number
}

export interface ProcessResult {
  exitCode: number
  stdout: string
  stderr: string
}

/**
 * Run a command as a child process and capture output.
 */
export async function runProcess(
  command: string,
  args: string[],
  options?: ProcessRunnerOptions,
): Promise<ProcessResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options?.cwd,
      env: options?.env ? { ...process.env, ...options.env } : undefined,
      stdio: ['pipe', 'pipe', 'pipe'],
      signal: options?.signal,
      shell: false,
      windowsHide: true,
    })

    const stdoutChunks: Buffer[] = []
    const stderrChunks: Buffer[] = []

    child.stdout.on('data', (chunk: Buffer) => stdoutChunks.push(chunk))
    child.stderr.on('data', (chunk: Buffer) => stderrChunks.push(chunk))

    let timeoutId: ReturnType<typeof setTimeout> | undefined
    if (options?.timeoutMs) {
      timeoutId = setTimeout(() => {
        child.kill('SIGTERM')
      }, options.timeoutMs)
    }

    child.on('error', (err) => {
      if (timeoutId)
        clearTimeout(timeoutId)
      reject(err)
    })

    child.on('close', (code) => {
      if (timeoutId)
        clearTimeout(timeoutId)
      resolve({
        exitCode: code ?? 1,
        stdout: Buffer.concat(stdoutChunks).toString('utf-8'),
        stderr: Buffer.concat(stderrChunks).toString('utf-8'),
      })
    })
  })
}
