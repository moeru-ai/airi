/**
 * FFmpeg sidechaincompress filter builder.
 * Used to duck the accompaniment when vocals are present.
 *
 * Parameter ranges enforced by FFmpeg:
 *   threshold: [0.000976563, 1]
 *   ratio:     [1, 20]
 *   attack:    [0.01, 2000]   (seconds)
 *   release:   [0.01, 9000]   (seconds)
 *   knee:      [1, 8]         (dB)
 */
export interface SidechainOptions {
  threshold?: number
  ratio?: number
  attack?: number
  release?: number
}

/**
 * Build FFmpeg filter args for sidechain compression (vocal ducking).
 */
export function buildSidechainFilter(options: SidechainOptions = {}): string {
  const t = options.threshold ?? 0.03
  const r = options.ratio ?? 4
  const a = Math.max(0.01, options.attack ?? 0.01)
  const rel = Math.max(0.01, options.release ?? 0.5)
  return `sidechaincompress=threshold=${t}:ratio=${r}:attack=${a}:release=${rel}:knee=4`
}
