import { createHash } from 'node:crypto'

/**
 * Compute a lightweight DOM fingerprint from browser DOM frame results.
 *
 * The fingerprint is a truncated SHA-256 hash of the serialized interactive
 * elements array. This provides a fast, deterministic way to detect whether
 * the page DOM has changed between two observations without storing the
 * full DOM tree.
 *
 * When the bridge is unavailable or returns no data, returns an empty string
 * so callers can safely compare without special-casing.
 */
export function computeDomFingerprint(frames: Array<{ frameId: number; result: unknown }>): string {
  if (!frames || frames.length === 0) return ''

  try {
    // Extract interactive elements from each frame's result payload
    const elements: unknown[] = []
    for (const frame of frames) {
      const payload = unwrapPayload(frame.result)
      if (payload && typeof payload === 'object' && 'interactiveElements' in payload) {
        const ie = (payload as Record<string, unknown>).interactiveElements
        if (Array.isArray(ie)) {
          elements.push(...ie)
        }
      }
    }

    if (elements.length === 0) return ''

    const serialized = JSON.stringify(elements)
    return createHash('sha256').update(serialized).digest('hex').slice(0, 16)
  }
  catch {
    return ''
  }
}

/**
 * Compare two DOM fingerprints and return a structured result.
 *
 * If either fingerprint is empty (bridge unavailable / no elements),
 * `unchanged` returns false to avoid false positives — we cannot
 * determine staleness without valid data.
 */
export function compareDomFingerprints(
  before: string,
  after: string,
): { unchanged: boolean; before: string; after: string } {
  // If either is empty, we can't reliably compare — assume changed
  if (!before || !after) {
    return { unchanged: false, before, after }
  }

  return {
    unchanged: before === after,
    before,
    after,
  }
}

// NOTICE: The bridge wraps results in { data: ... } or { success: ..., data: ... }.
// This mirrors the unwrap logic in register-tools.ts.
function unwrapPayload(value: unknown): unknown {
  if (!value || typeof value !== 'object') return value
  const record = value as Record<string, unknown>
  if ('data' in record) return record.data
  return value
}
