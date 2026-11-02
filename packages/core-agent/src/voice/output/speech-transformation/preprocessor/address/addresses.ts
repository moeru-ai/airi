import { addressLocale } from './locales'

const label = String.raw`[a-z0-9](?:[a-z0-9-]*[a-z0-9])?`
/** A host name with a top-level domain of letters. `3.14` and `v1.2.3` are not hosts. */
const domain = String.raw`(?:${label}\.)+[a-z]{2,}`
const host = String.raw`(?:${domain}|localhost|\d{1,3}(?:\.\d{1,3}){3})`
/** A path, query, or fragment ends at a space, a quote, or CJK punctuation. */
const pathCharacters = String.raw`[^\s<>"'\x60，。、；：！？）」』]*`
/**
 * A text that is one address: with a scheme, for example `https://home.example.com:8123/config`, or a domain without
 * one, for example `example.com/docs`. A domain without a scheme needs a top-level domain, so `3.14` is not an address.
 */
const address = new RegExp(String.raw`^(?:[a-z][a-z0-9+.-]*:\/\/${host}|${domain})(?::\d+)?(?:[/?#]${pathCharacters})?$`, 'iu')

/** Reads one address as words, for example `https://a.io:8123/b` as `https a 点 io 端口 8123 斜杠 b`. */
function speakParts(text: string, language: string): string {
  const words = addressLocale(language)
  const scheme = /^([a-z][a-z0-9+.-]*):\/\//i.exec(text)
  const withoutScheme = scheme ? text.slice(scheme[0].length) : text
  const queryStart = withoutScheme.search(/[?#]/)
  // A query or a fragment has no words that a listener can use. Its private use characters stay, because the speech
  // stream marks the place of a special token with one, see `controlMarker` in ../../../response.
  const location = queryStart === -1 ? withoutScheme : withoutScheme.slice(0, queryStart)
  const markers = queryStart === -1 ? '' : withoutScheme.slice(queryStart).match(/\p{Co}/gu)?.join('') ?? ''
  const [authority = '', ...segments] = location.split('/')
  const [hostname = '', port] = authority.split(':')
  const dotted = (part: string) => part.split('.').join(` ${words.dot} `)

  return [
    ...(scheme ? [scheme[1]!] : []),
    dotted(hostname),
    ...(port ? [`${words.port} ${port}`] : []),
    ...segments.filter(Boolean).flatMap(segment => [words.slash, dotted(segment)]),
  ].join(' ') + markers
}

/**
 * Reads a text that is one web address as words of `language`, or returns `undefined` for other text.
 *
 * The TTS chunker ends a chunk at each `.`, so `home.example.com` was three requests with a pause after each part.
 */
export function speakAddress(text: string, language: string): string | undefined {
  const trimmed = text.trim()
  // The speech stream marks a special token with a private use character, which can be anywhere in the address.
  return address.test(trimmed.replace(/\p{Co}/gu, '')) ? speakParts(trimmed, language) : undefined
}
