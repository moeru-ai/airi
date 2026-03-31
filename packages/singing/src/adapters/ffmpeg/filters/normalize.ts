import { runFfmpeg } from '../ffmpeg-runner'

/**
 * FFmpeg loudnorm filter builder.
 * Supports both single-pass and two-pass normalization.
 */
export interface LoudnormOptions {
  targetLufs?: number
  lra?: number
  truePeakDb?: number
}

export interface LoudnormStats {
  input_i: string
  input_lra: string
  input_tp: string
  input_thresh: string
}

/**
 * Build FFmpeg filter string for loudness normalization (single-pass).
 */
export function buildLoudnormFilter(options: LoudnormOptions = {}): string {
  const i = options.targetLufs ?? -14
  const lra = options.lra ?? 11
  const tp = options.truePeakDb ?? -1.5
  return `loudnorm=I=${i}:LRA=${lra}:TP=${tp}`
}

/**
 * Build FFmpeg filter string for loudness normalization (two-pass, pass 2).
 * Uses measured stats from pass 1 for linear-mode application.
 */
export function buildLoudnormFilterTwoPass(
  options: LoudnormOptions = {},
  stats: LoudnormStats,
): string {
  const i = options.targetLufs ?? -14
  const lra = options.lra ?? 11
  const tp = options.truePeakDb ?? -1.5
  return `loudnorm=I=${i}:LRA=${lra}:TP=${tp}:measured_I=${stats.input_i}:measured_LRA=${stats.input_lra}:measured_TP=${stats.input_tp}:measured_thresh=${stats.input_thresh}:linear=true`
}

/**
 * Run loudnorm pass 1 (analysis only) and extract measured stats from stderr JSON.
 */
export async function analyzeLoudnorm(
  inputPath: string,
  options: LoudnormOptions = {},
  signal?: AbortSignal,
): Promise<LoudnormStats | null> {
  const filter = `${buildLoudnormFilter(options)}:print_format=json`
  const args = ['-i', inputPath, '-af', filter, '-f', 'null', '-']
  const result = await runFfmpeg(args, { signal })

  if (result.exitCode !== 0)
    return null

  return parseLoudnormStats(result.stderr)
}

const LOUDNORM_JSON_RE = /\{[\s\S]*"input_i"\s*:[\s\S]*\}/

/**
 * Parse loudnorm JSON stats from FFmpeg stderr output.
 */
export function parseLoudnormStats(stderr: string): LoudnormStats | null {
  const jsonMatch = stderr.match(LOUDNORM_JSON_RE)
  if (!jsonMatch)
    return null

  try {
    const parsed = JSON.parse(jsonMatch[0])
    if (parsed.input_i && parsed.input_lra && parsed.input_tp && parsed.input_thresh) {
      return {
        input_i: String(parsed.input_i),
        input_lra: String(parsed.input_lra),
        input_tp: String(parsed.input_tp),
        input_thresh: String(parsed.input_thresh),
      }
    }
  }
  catch { /* JSON parse failure — fall back to single-pass */ }

  return null
}
