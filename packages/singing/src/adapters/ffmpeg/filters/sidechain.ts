/**
 * FFmpeg sidechaincompress filter builder.
 * Used to duck the accompaniment when vocals are present.
 */
export interface SidechainOptions {
  threshold?: number
  ratio?: number
  attack?: number
  release?: number
}

/**
 * Build FFmpeg filter args for sidechain compression.
 */
export function buildSidechainFilter(options: SidechainOptions = {}): string {
  const t = options.threshold ?? 0.02
  const r = options.ratio ?? 6
  const a = options.attack ?? 0.01
  const rel = options.release ?? 0.5
  return `sidechaincompress=threshold=${t}:ratio=${r}:attack=${a}:release=${rel}`
}
