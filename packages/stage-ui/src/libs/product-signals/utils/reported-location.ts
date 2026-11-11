/**
 * Reduces a page URL to the part that OpenPanel stores as the page of an event.
 *
 * A web page keeps its origin and path. A page of an installed app gives only its route, because OpenPanel reads
 * only `http` URLs and paths that start with `/`. A `file:` URL also holds a directory of the user's computer.
 */
export function reportedLocation(location: string): string {
  const withoutQueryAndHash = location.split(/[?#]/, 1)[0]
  if (!URL.canParse(location))
    return withoutQueryAndHash

  const url = new URL(location)
  if (url.protocol === 'http:' || url.protocol === 'https:')
    return withoutQueryAndHash

  // The desktop app uses hash routes: `file:///.../index.html#/settings?id=1` is the route `/settings`.
  if (url.hash.startsWith('#/'))
    return url.hash.slice(1).split('?', 1)[0]

  return url.protocol === 'file:' ? '/' : url.pathname
}
