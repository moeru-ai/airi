import { spawn } from 'node:child_process'

export interface RunProcessOptions {
  stdin?: string
  timeoutMs?: number
  env?: NodeJS.ProcessEnv
  cwd?: string
}

export async function runProcess(command: string, args: string[], options: RunProcessOptions = {}) {
  return await new Promise<{ stdout: string, stderr: string }>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    let stdout = ''
    let stderr = ''
    let finished = false

    const stopTimer = options.timeoutMs
      ? setTimeout(() => {
          if (finished)
            return

          finished = true
          child.kill('SIGTERM')
          reject(new Error(`process timeout after ${options.timeoutMs}ms: ${command}`))
        }, options.timeoutMs)
      : undefined

    const cleanup = () => {
      if (stopTimer)
        clearTimeout(stopTimer)
    }

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString('utf-8')
    })

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString('utf-8')
    })

    child.on('error', (error) => {
      if (finished)
        return

      finished = true
      cleanup()
      reject(error)
    })

    child.on('close', (code) => {
      if (finished)
        return

      finished = true
      cleanup()

      if (code !== 0) {
        reject(new Error(stderr.trim() || `process exited with code ${code}: ${command}`))
        return
      }

      resolve({ stdout, stderr })
    })

    if (options.stdin) {
      child.stdin.write(options.stdin)
    }
    child.stdin.end()
  })
}

export function sanitizeFileSegment(value: string | undefined, fallback: string) {
  const normalized = (value || fallback).trim().toLowerCase()
  const safe = normalized.replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '')
  return safe || fallback
}
