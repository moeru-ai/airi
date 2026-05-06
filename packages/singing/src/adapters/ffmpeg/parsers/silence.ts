/**
 * Parser for FFmpeg silencedetect filter output.
 */
export interface SilenceSegment {
  startSec: number
  endSec: number
  durationSec: number
}

const SILENCE_START_RE = /silence_start:\s*(-?[\d.]+)/g
const SILENCE_END_RE = /silence_end:\s*(-?[\d.]+)\s*\|\s*silence_duration:\s*([\d.]+)/g

/**
 * Parse silence segments from FFmpeg stderr output.
 * FFmpeg silencedetect outputs lines like:
 *   [silencedetect @ ...] silence_start: 1.234
 *   [silencedetect @ ...] silence_end: 5.678 | silence_duration: 4.444
 */
export function parseSilenceDetectOutput(
  stderr: string,
): SilenceSegment[] {
  const segments: SilenceSegment[] = []

  const starts: number[] = []
  let match: RegExpExecArray | null

  while ((match = SILENCE_START_RE.exec(stderr)) !== null) {
    starts.push(Number.parseFloat(match[1]))
  }

  let i = 0
  while ((match = SILENCE_END_RE.exec(stderr)) !== null) {
    const endSec = Number.parseFloat(match[1])
    const durationSec = Number.parseFloat(match[2])
    const startSec = starts[i] ?? (endSec - durationSec)
    segments.push({ startSec, endSec, durationSec })
    i++
  }

  return segments
}
