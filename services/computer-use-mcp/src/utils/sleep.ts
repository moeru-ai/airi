/**
 * Async sleep utility.
 *
 * Extracted as a standalone module so tests can mock it via `vi.mock`
 * to avoid real delays from setTimeout.
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
