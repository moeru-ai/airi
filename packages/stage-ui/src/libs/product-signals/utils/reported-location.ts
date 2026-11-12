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
