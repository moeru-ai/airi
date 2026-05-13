import { webcrypto } from 'node:crypto'

import { createContentLoader } from 'vitepress'

export interface Author {
  role: string
  kind: 'person' | 'team'

  displayName: string

  githubUsername?: string
  githubEmail?: string

  avatar?: string
  avatarFallback: string
}

interface MarkdownAuthor {
  name?: string
  role?: string
  kind?: 'person' | 'team'
  avatar?: string

  githubUsername?: string
  githubEmail?: string
}

/**
 * Hashes a string using SHA-256
 *
 * Official example by MDN: https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/digest
 * @param {string} message - The message to be hashed
 * @returns {Promise<string>} - The SHA-256 hash of the message
 */
async function digestStringAsSHA256(message: string) {
  const msgUint8 = new TextEncoder().encode(message) // encode as (utf-8) Uint8Array
  const hashBuffer = await webcrypto.subtle.digest('SHA-256', msgUint8) // hash the message
  const hashArray = Array.from(new Uint8Array(hashBuffer)) // convert buffer to byte array
  const hashHex = hashArray
    .map(b => b.toString(16).padStart(2, '0'))
    .join('') // convert bytes to hex string
  return hashHex
}

async function newAvatarForAuthor(mappedAuthor?: { overrideAvatar?: string, githubUsername?: string, displayName?: string } | null, email?: string | null): Promise<string> {
  if (mappedAuthor) {
    if (mappedAuthor.overrideAvatar)
      return mappedAuthor.overrideAvatar
    if (mappedAuthor.githubUsername)
      return `https://github.com/${mappedAuthor.githubUsername}.png`
  }

  return `https://gravatar.com/avatar/${await digestStringAsSHA256(email || mappedAuthor?.githubUsername || mappedAuthor?.displayName || 'unknown')}?d=retro`
}

export default createContentLoader('**/*.md', {
  async transform(raw): Promise<Array<{ url: string, authors: Author[] }>> {
    return (await Promise.all(
      raw
        .map(async ({ url, frontmatter }) => {
          const authors: MarkdownAuthor[] = frontmatter.authors
          if (!authors || !Array.isArray(authors)) {
            return
          }

          const authorsTransformed = await Promise.all(authors.map(async (author): Promise<Author> => {
            const displayName = author.name || author.githubUsername || author.githubEmail || 'Unknown Author'

            return {
              role: author.role || 'Contributor',
              kind: author.kind || 'person',

              displayName,

              githubUsername: author.githubUsername,
              githubEmail: author.githubEmail,

              avatar: author.avatar || await newAvatarForAuthor({ githubUsername: author.githubUsername, displayName }, author.githubEmail),
              avatarFallback: `https://gravatar.com/avatar/${await digestStringAsSHA256(displayName)}?d=retro`,
            }
          }))

          return {
            url,
            authors: authorsTransformed,
          }
        }),
    )).filter(item => item != null)
  },
})
