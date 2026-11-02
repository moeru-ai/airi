import { addressLocale } from './locales'

const label = String.raw`[a-z0-9](?:[a-z0-9-]*[a-z0-9])?`
/** A host name with a top-level domain of letters. `3.14` and `v1.2.3` are not hosts. */
const domain = String.raw`(?:${label}\.)+[a-z]{2,}`
const host = String.raw`(?:${domain}|localhost|\d{1,3}(?:\.\d{1,3}){3})`
/** A path, query, or fragment ends at a space, a quote, or CJK punctuation. */
const pathCharacters = String.raw`[^\s<>"'\x60，。、；：！？）」』]*`
/**
 * An address with a scheme, for example `https://assistant.ihome.cat:8123/config`, or a domain without one, for
 * example `example.com/docs`. A domain without a scheme needs a top-level domain, so `3.14` stays a number.
 */
const addresses = new RegExp([
  String.raw`[a-z][a-z0-9+.-]*:\/\/${host}(?::\d+)?(?:[/?#]${pathCharacters})?`,
  String.raw`(?<![\w@./-])${domain}(?::\d+)?(?:[/?#]${pathCharacters})?(?![\w-])`,
].join('|'), 'giu')
/** Punctuation that ends the sentence around an address, not the address. */
const trailingPunctuation = /[.,;:!?)\]]+$/

/** Reads one address as words, for example `https://a.io:8123/b` as `https a 点 io 端口 8123 斜杠 b`. */
function speakAddress(address: string, language: string): string {
  const words = addressLocale(language)
  const scheme = /^([a-z][a-z0-9+.-]*):\/\//i.exec(address)
  const withoutScheme = scheme ? address.slice(scheme[0].length) : address
  const queryStart = withoutScheme.search(/[?#]/)
  // A query or a fragment has no words that a listener can use. Its private use characters stay, because the speech
  // stream marks the place of a special token with one, see `controlMarker` in ../../../response.
  const location = queryStart === -1 ? withoutScheme : withoutScheme.slice(0, queryStart)
  const markers = queryStart === -1 ? '' : withoutScheme.slice(queryStart).match(/\p{Co}/gu)?.join('') ?? ''
  const [authority = '', ...segments] = location.split('/')
  const [hostname = '', port] = authority.split(':')
  const dotted = (text: string) => text.split('.').join(` ${words.dot} `)

  return [
    ...(scheme ? [scheme[1]!] : []),
    dotted(hostname),
    ...(port ? [`${words.port} ${port}`] : []),
    ...segments.filter(Boolean).flatMap(segment => [words.slash, dotted(segment)]),
  ].join(' ') + markers
}

/**
 * Reads the web addresses of a text as words of `language`.
 *
 * The TTS chunker ends a chunk at each `.`, so `assistant.ihome.cat` was three requests with a pause after each part.
 */
export function speakAddresses(text: string, language: string): string {
  return text.replace(addresses, (match) => {
    const punctuation = trailingPunctuation.exec(match)?.[0] ?? ''
    return speakAddress(match.slice(0, match.length - punctuation.length), language) + punctuation
  })
}
