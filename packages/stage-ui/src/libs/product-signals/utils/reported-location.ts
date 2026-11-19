/**
 * Reduces a page URL to the address that OpenPanel stores as the page of an event.
 *
 * Without `appOrigin`, the page keeps its origin and path. With `appOrigin`, the result is that origin and the route of
 * the page. An installed app loads its pages from `file:`, `capacitor:`, or `https://localhost`, and a `file:` URL
 * holds a directory of the user's computer.
 *
 * @param location Page URL from `window.location.href`.
 * @param appOrigin Origin that stands for an installed app. Omit it for a web page.
 */
export function reportedLocation(location: string, appOrigin?: string): string {
  const withoutQueryAndHash = location.split(/[?#]/, 1)[0]
  if (!appOrigin)
    return withoutQueryAndHash

  let url: URL
  try {
    url = new URL(location)
  }
  catch {
    // `URL.canParse` needs Safari 17. The mobile app supports iOS 15.
    return withoutQueryAndHash
  }

  // The desktop app uses hash routes: `file:///.../index.html#/settings?id=1` is the route `/settings`.
  if (url.hash.startsWith('#/'))
    return `${appOrigin}${url.hash.slice(1).split('?', 1)[0]}`

  return `${appOrigin}${url.protocol === 'file:' ? '/' : url.pathname}`
}

// Only SDK properties start with `$`. A product property such as `base_url` keeps its value.
const urlPropertyPattern = /^\$.*(?:url|referrer)$/i
const pathnamePropertyPattern = /^\$.*pathname$/i
const hostPropertyPattern = /^\$.*host$/i

/**
 * Rewrites the page properties of one event of an installed app, so the reported pages never hold a local directory.
 *
 * PostHog reads the page from `window.location`. On the desktop app that is a `file:` URL, and `$pathname` is the
 * path of the file on the user's computer. Each URL property becomes {@link reportedLocation} under `appOrigin`. Each
 * pathname property takes the path of its rewritten URL property, or `/` when it has none. Each host property becomes
 * the host of `appOrigin`. The object is changed in place.
 *
 * @example
 * const properties = { $current_url: 'file:///home/user/app/index.html#/settings', $pathname: '/home/user/app/index.html', $host: '' }
 * reportAppLocation(properties, 'https://desktop.example.com')
 * // properties => { $current_url: 'https://desktop.example.com/settings', $pathname: '/settings', $host: 'desktop.example.com' }
 */
export function reportAppLocation(properties: Record<string, unknown> | undefined, appOrigin: string): void {
  if (!properties)
    return

  for (const [key, value] of Object.entries(properties)) {
    if (typeof value === 'string' && value && value !== '$direct' && urlPropertyPattern.test(key))
      properties[key] = reportedLocation(value, appOrigin)
  }

  for (const [key, value] of Object.entries(properties)) {
    if (typeof value !== 'string')
      continue
    if (hostPropertyPattern.test(key)) {
      properties[key] = new URL(appOrigin).host
      continue
    }
    if (!pathnamePropertyPattern.test(key))
      continue

    // `$pathname` pairs with `$current_url`. Other pairs share a prefix, for example `$session_entry_url`.
    const prefix = key.slice(0, -'pathname'.length)
    const pairedUrl = [`${prefix}current_url`, `${prefix}url`]
      .map(name => properties[name])
      .find(url => typeof url === 'string' && url.startsWith(appOrigin))
    properties[key] = typeof pairedUrl === 'string' ? new URL(pairedUrl).pathname : '/'
  }
}
