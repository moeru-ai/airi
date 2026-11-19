/**
 * The tracks that the page wants from producers: all tracks while none is hidden, or else every known track that is
 * not hidden. The collector demand has no "all except", so the list follows the known tracks. A track that appears
 * later is wanted until the user hides it.
 *
 * @example
 * visibleTracksOf(['a', 'b'], new Set(['a'])) // => ['b']
 * visibleTracksOf(['a', 'b'], new Set()) // => '*'
 */
export function visibleTracksOf(trackPaths: Iterable<string>, hidden: ReadonlySet<string>): string[] | '*' {
  if (hidden.size === 0)
    return '*'
  return [...trackPaths].filter(path => !hidden.has(path)).sort()
}

/** True when two wanted values select the same tracks. Track lists come sorted from {@link visibleTracksOf}. */
export function sameVisibleTracks(a: string[] | '*' | undefined, b: string[] | '*'): boolean {
  if (a === '*' || b === '*')
    return a === b
  return a !== undefined && a.length === b.length && a.every((path, index) => path === b[index])
}
