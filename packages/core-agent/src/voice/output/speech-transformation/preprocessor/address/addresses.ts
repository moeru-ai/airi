import { addressLocale } from './locales'

/** A host name with a top-level domain of letters. `3.14` and `v1.2.3` are not hosts. */
const domain = /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/
const schemePrefix = /^[a-z][a-z0-9+.-]*:\/\//i
/** The speech stream marks the place of a special token with a private use character, see `controlMarker` in ../../../response. */
const markers = /\p{Co}/gu

function toUrl(text: string): URL | undefined {
  try {
    return new URL(text)
  }
  catch {}
}

/**
 * Parses a text that is one address, for example `https://home.example.com:8123/config` or `example.com/docs`.
 * A text with `://` is an address when `URL` parses it.
 */
function parseAddress(text: string): { url: URL, scheme: boolean } | undefined {
  if (/\s/.test(text))
    return

  if (schemePrefix.test(text)) {
    const url = toUrl(text)
    return url && { url, scheme: true }
  }

  // Without a scheme, `URL` also parses `3.14` as an IPv4 address and `user@example.com` as a user and a host.
  // So only a domain name without a user is an address.
  const url = toUrl(`https://${text}`)
  return url && !url.username && domain.test(url.hostname) ? { url, scheme: false } : undefined
}

/** A path segment as written. The URL parser encodes characters outside ASCII, for example `%E8%B7%AF`. */
function decodeSegment(segment: string): string {
  try {
    return decodeURIComponent(segment)
  }
  catch {
    return segment
  }
}

/**
 * Reads a text that is one web address as words of `language`, or returns `undefined` for other text.
 * A query and a fragment have no words that a listener can use, so they are not read.
 *
 * The TTS chunker ends a chunk at each `.`, so `home.example.com` was three requests with a pause after each part.
 */
export function speakAddress(text: string, language: string): string | undefined {
  const trimmed = text.trim()
  const address = parseAddress(trimmed.replace(markers, ''))
  if (!address)
    return

  const { url, scheme } = address
  const words = addressLocale(language)
  const dotted = (part: string) => part.split('.').join(` ${words.dot} `)
  const spoken = [
    ...(scheme ? [url.protocol.slice(0, -1)] : []),
    ...(url.hostname ? [dotted(url.hostname)] : []),
    ...(url.port ? [`${words.port} ${url.port}`] : []),
    ...url.pathname.split('/').filter(Boolean).flatMap(segment => [words.slash, dotted(decodeSegment(segment))]),
  ].join(' ')
  // Words have no place for a marker inside the address, so its markers follow it.
  return spoken + (trimmed.match(markers)?.join('') ?? '')
}
