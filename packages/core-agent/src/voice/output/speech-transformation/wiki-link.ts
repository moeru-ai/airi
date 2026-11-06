import type { Data, Literal } from 'mdast'

/** The data that `@flowershow/remark-wiki-link` puts on its nodes. Only the alias has words. */
interface WikiLinkData extends Data {
  alias?: string
}

/** `[[target]]` or `[[target|alias]]`. `value` is the target, for example `Note#Heading`. */
export interface WikiLink extends Literal {
  type: 'wikiLink'
  data?: WikiLinkData
}

/** `![[target]]`, an embedded file or note. A size such as `|300` is not an alias. */
export interface Embed extends Literal {
  type: 'embed'
  data?: WikiLinkData
}

declare module 'mdast' {
  interface PhrasingContentMap {
    wikiLink: WikiLink
    embed: Embed
  }

  interface RootContentMap {
    wikiLink: WikiLink
    embed: Embed
  }
}

type EmbedKind = 'image' | 'audio' | 'video' | 'pdf'

const embedKinds: Readonly<Record<string, EmbedKind>> = {
  avif: 'image',
  bmp: 'image',
  gif: 'image',
  jpeg: 'image',
  jpg: 'image',
  png: 'image',
  svg: 'image',
  webp: 'image',
  flac: 'audio',
  m4a: 'audio',
  mp3: 'audio',
  ogg: 'audio',
  wav: 'audio',
  webm: 'video',
  mkv: 'video',
  mov: 'video',
  mp4: 'video',
  pdf: 'pdf',
}

/** The word for each kind of embedded file, by primary language subtag. */
const embedWords: Readonly<Record<string, Record<EmbedKind, string>>> = {
  en: { image: 'image', audio: 'audio', video: 'video', pdf: 'PDF file' },
  zh: { image: '图片', audio: '音频', video: '视频', pdf: 'PDF 文件' },
}

/** The word for an embedded file in `language`, or `undefined` for a note, which reads as its name. */
export function embedWord(target: string, language: string): string | undefined {
  // A target can have a fragment, as in `Document.pdf#page=3`. The path of a URL drops it.
  const kind = embedKinds[new URL(target, 'file:///').pathname.split('.').at(-1)?.toLowerCase() ?? '']
  return kind && (embedWords[language] ?? embedWords.en!)[kind]
}

/** The word for an image without alternative text. */
export function imageWord(language: string): string {
  return (embedWords[language] ?? embedWords.en!).image
}

/**
 * The words of a wiki link target, as Obsidian shows it: `Note#Heading` reads as `Note Heading`.
 * A block reference such as `Note#^a1b2` has no words after the note.
 */
export function speakWikiTarget(target: string): string {
  const [page = '', ...headings] = target.split('#')
  return [page, ...headings.filter(heading => !heading.startsWith('^'))].map(part => part.trim()).filter(Boolean).join(' ')
}
