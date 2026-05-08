import type { ProcessRunnerOptions } from '../runtime/process-runner'

import { resolveRuntimeEnv } from '../runtime/env-resolver'
import { runProcess } from '../runtime/process-runner'

/**
 * Low-level FFmpeg process runner.
 * Reads ffmpegPath from the runtime environment by default.
 */
export interface FfmpegRunnerOptions {
  ffmpegPath?: string
  cwd?: string
  signal?: AbortSignal
}

export interface FfmpegResult {
  exitCode: number
  stdout: string
  stderr: string
}

/**
 * Run an FFmpeg command with the given arguments.
 */
export async function runFfmpeg(
  args: string[],
  options?: FfmpegRunnerOptions,
): Promise<FfmpegResult> {
  const ffmpegBin = options?.ffmpegPath ?? resolveRuntimeEnv().ffmpegPath
  const processOptions: ProcessRunnerOptions = {
    cwd: options?.cwd,
    signal: options?.signal,
    timeoutMs: 300_000,
  }
  const result = await runProcess(ffmpegBin, args, processOptions)
  return {
    exitCode: result.exitCode,
    stdout: result.stdout,
    stderr: result.stderr,
  }
}
