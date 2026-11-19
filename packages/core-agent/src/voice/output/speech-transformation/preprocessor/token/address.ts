import type { SpeechTokenReader } from './types'

import { tokenLocale } from './locales'

/** A host name with a top-level domain of letters. `3.14` and `v1.2.3` are not hosts. */
const domain = /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/
const ipv4 = /^\d{1,3}(?:\.\d{1,3}){3}$/
const scheme = /^([a-z][a-z0-9+.-]*):\/\//i

function toUrl(text: string): URL | undefined {
  try {
    return new URL(text)
  }
  catch {}
}

/**
 * Whether a token is one address.
 *
 * A token with `://` is an address when `URL` parses it. Without a scheme, `URL` also parses `3.14` as an IPv4 address
 * and `user@example.com` as a user and a host. So a token without a scheme needs a domain name, or an IPv4 address with
 * a port or a path, and no user.
 */
function isAddress(token: string): boolean {
  if (scheme.test(token))
    return toUrl(token) !== undefined

  const url = toUrl(`https://${token}`)
  if (!url || url.username)
    return false
  return domain.test(url.hostname) || (ipv4.test(url.hostname) && token.startsWith(url.hostname) && /[:/]/.test(token))
}

/** A path segment as written. A percent escape, as `%20`, reads as its character. */
function decodeSegment(segment: string): string {
  try {
    return decodeURIComponent(segment)
  }
  catch {
    return segment
  }
}

/**
 * Reads web addresses, for example `https://home.example.com:8123/config` as `https home 点 example 点 com 端口 8123 斜杠
 * config`. The words come from the token as written, so the case, an internationalized domain, and a default port stay.
 * The scheme separator, a user, a query, a fragment, and a trailing slash have no words that a listener can use.
 */
export const addressReader: SpeechTokenReader = {
  name: 'address',
  read: (token, { language }) => {
    if (!isAddress(token))
      return

    const words = tokenLocale(language)
    const dotted = (part: string) => part.split('.').filter(Boolean).join(` ${words.dot} `)
    const schemeName = scheme.exec(token)?.[1]
    const location = (schemeName ? token.slice(schemeName.length + 3) : token).split(/[?#]/)[0]!
    const slash = location.indexOf('/')
    const authority = slash === -1 ? location : location.slice(0, slash)
    const hostAndPort = authority.slice(authority.lastIndexOf('@') + 1)
    const port = /:(\d+)$/.exec(hostAndPort)
    const host = port ? hostAndPort.slice(0, port.index) : hostAndPort
    const segments = slash === -1 ? [] : location.slice(slash).split('/').filter(Boolean)

    return [
      ...(schemeName ? [schemeName] : []),
      ...(host ? [dotted(host)] : []),
      ...(port ? [`${words.port} ${port[1]}`] : []),
      ...segments.flatMap(segment => [words.slash, dotted(decodeSegment(segment))]),
    ].join(' ')
  },
}
