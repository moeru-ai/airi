import type { ProcessRunnerOptions } from './process-runner'

import { runProcess } from './process-runner'

/**
 * Client for communicating with the Python singing worker.
 * Uses subprocess invocations: each call spawns python -m <module> with JSON args.
 */
export interface PythonWorkerClient {
  /** Send a request to the Python worker and wait for response */
  call: (method: string, params: Record<string, unknown>) => Promise<Record<string, unknown>>
  /** Check if the Python worker is available */
  healthCheck: () => Promise<boolean>
}

/**
 * Create a subprocess-based Python worker client.
 * Each `call()` spawns `python -m <workerModule> --method <method> --json <params>`.
 */
export function createSubprocessWorkerClient(
  pythonPath: string,
  workerModule: string,
): PythonWorkerClient {
  const baseOptions: ProcessRunnerOptions = {
    timeoutMs: 600_000,
  }

  return {
    async call(method: string, params: Record<string, unknown>): Promise<Record<string, unknown>> {
      const jsonArgs = JSON.stringify({ method, params })
      const result = await runProcess(
        pythonPath,
        ['-m', workerModule, '--json-rpc', jsonArgs],
        baseOptions,
      )

      if (result.exitCode !== 0) {
        throw new Error(
          `Python worker error (exit ${result.exitCode}): ${result.stderr.slice(0, 2000)}`,
        )
      }

      const lines = result.stdout.trim().split('\n')
      const lastLine = lines.at(-1) ?? ''
      try {
        return JSON.parse(lastLine) as Record<string, unknown>
      }
      catch {
        throw new Error(
          `Failed to parse Python worker response: ${lastLine.slice(0, 500)}`,
        )
      }
    },

    async healthCheck(): Promise<boolean> {
      try {
        const result = await runProcess(
          pythonPath,
          ['-m', workerModule, '--health-check'],
          { timeoutMs: 10_000 },
        )
        return result.exitCode === 0
      }
      catch {
        return false
      }
    },
  }
}
