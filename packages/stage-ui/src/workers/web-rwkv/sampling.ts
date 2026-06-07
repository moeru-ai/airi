/**
 * Top-k truncation for web-rwkv generation.
 *
 * The wasm `NucleusSampler` does penalties + top-p + temperature but has no top-k,
 * so the worker truncates the probability vector itself (after softmax, before the
 * sampler's top-p). All other sampling params are fed straight to the native
 * sampler unchanged.
 *
 * Pure (no wasm/DOM) so the policy can be unit-tested directly, mirroring
 * {@link file://./stop.ts}.
 */

/**
 * Keep only the `k` highest-probability entries (top-k truncation) and renormalize,
 * in place.
 *
 * `k <= 0` (disabled) and `k >= probs.length` (nothing to drop) are no-ops. Ties at
 * the cutoff are all kept, so slightly more than `k` entries may survive — the
 * standard, harmless behavior.
 *
 * Before (k = 2):
 * - `[0.5, 0.3, 0.15, 0.05]`
 *
 * After (tail dropped, remainder renormalized to sum 1):
 * - `[0.625, 0.375, 0, 0]`
 *
 * @param probs - Probability vector (sums to ~1), mutated in place.
 * @param k - Number of top entries to retain; `0` disables truncation.
 */
export function applyTopK(probs: Float32Array, k: number): void {
  if (k <= 0 || k >= probs.length)
    return

  // k-th largest probability is the inclusive cutoff. TypedArray.sort is numeric
  // (ascending), unlike Array.sort. O(n log n) over the vocab, but only paid when
  // top-k is enabled (default 0 skips this entirely).
  const cutoff = Float32Array.from(probs).sort()[probs.length - k]

  let sum = 0
  for (let i = 0; i < probs.length; i++) {
    if (probs[i] < cutoff)
      probs[i] = 0
    else
      sum += probs[i]
  }
  if (sum > 0) {
    for (let i = 0; i < probs.length; i++)
      probs[i] /= sum
  }
}
