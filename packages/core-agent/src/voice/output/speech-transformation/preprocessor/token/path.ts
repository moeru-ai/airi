import type { TokenLocale } from './locales'
import type { SpeechTokenContext, SpeechTokenReader } from './types'

import { tokenLocale } from './locales'

/**
 * A path from the root, the home folder, the current folder, or a drive, for example `/etc`, `~/a`, `./a`, `.\a`, or
 * `C:\a`. A token that starts with one `\`, as `\alpha`, is TeX, not a path.
 */
const rooted = /^(?:~|\.{1,2})?\/|^\.{1,2}\\|^[a-z]:\\/i
/** A file name with an extension of letters and digits, for example `index.ts` or `archive.tar.gz`. */
const fileName = /^[\w-]+(?:\.[\w-]+)*\.[a-z][a-z0-9]*$/i
/**
 * A file name in prose needs a name and an extension of two characters or more, so `e.g` and `U.S` are not file names.
 * Inline code also accepts `main.c`.
 */
const proseFileName = /^[\w-]{2,}(?:\.[\w-]+)*\.[a-z][a-z0-9]+$/i
/** A hidden file in inline code, for example `.env` or `.gitignore`. */
const dotFile = /^\.[a-z][\w.-]*$/i

function isPath(token: string, { kind }: SpeechTokenContext): boolean {
  if (rooted.test(token) || (kind === 'code' && dotFile.test(token)))
    return true

  const name = token.split(/[/\\]/).at(-1)!
  return (kind === 'code' ? fileName : proseFileName).test(name)
}

/** One part between separators, for example `~`, `C:`, `..`, `.env`, or `index.ts`. */
function speakSegment(segment: string, words: TokenLocale): string {
  if (segment === '~')
    return words.tilde
  const drive = /^([a-z]):$/i.exec(segment)
  if (drive)
    return `${drive[1]} ${words.colon}`
  if (/^\.+$/.test(segment))
    return Array.from(segment, () => words.dot).join(' ')

  const spoken = segment.split('.').filter(Boolean).join(` ${words.dot} `)
  return segment.startsWith('.') ? `${words.dot} ${spoken}` : spoken
}

/**
 * Reads file paths, for example `./src/index.ts` as `点 斜杠 src 斜杠 index 点 ts`.
 * A path without a file name in its last part, as `and/or` in prose, is not a path, so it stays as written.
 */
export const pathReader: SpeechTokenReader = {
  name: 'path',
  read: (token, context) => {
    if (!isPath(token, context))
      return

    const words = tokenLocale(context.language)
    const separators: Record<string, string> = { '/': words.slash, '\\': words.backslash }
    return token.split(/([/\\])/).filter(Boolean).map(part => separators[part] ?? speakSegment(part, words)).join(' ')
  },
}
