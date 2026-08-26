import { webcrypto } from 'node:crypto'

import { createContentLoader } from 'vitepress'

export interface Author {
  avatar?: string
  avatarFallback: string

  displayName: string

  githubEmail?: string
  githubUsername?: string

  kind: 'person' | 'team'
  role: string
}

interface MarkdownAuthor {
  avatar?: string
  githubEmail?: string
  githubUsername?: string
  kind?: 'person' | 'team'

  name?: string
  role?: string
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

async function newAvatarForAuthor(mappedAuthor?: null | { displayName?: string, githubUsername?: string, overrideAvatar?: string }, email?: null | string): Promise<string> {
  if (mappedAuthor) {
    if (mappedAuthor.overrideAvatar)
      return mappedAuthor.overrideAvatar
    if (mappedAuthor.githubUsername)
      return `https://github.com/${mappedAuthor.githubUsername}.png`
  }

  return `https://gravatar.com/avatar/${await digestStringAsSHA256(email || mappedAuthor?.githubUsername || mappedAuthor?.displayName || 'unknown')}?d=retro`
}

export default createContentLoader('**/*.md', {
  async transform(raw): Promise<Array<{ authors: Author[], url: string }>> {
    return (await Promise.all(
      raw
        .map(async ({ frontmatter, url }) => {
          const authors: MarkdownAuthor[] = frontmatter.authors
          if (!authors || !Array.isArray(authors)) {
            return
          }

          const authorsTransformed = await Promise.all(authors.map(async (author): Promise<Author> => {
            const displayName = author.name || author.githubUsername || author.githubEmail || 'Unknown Author'

            return {
              avatar: author.avatar || await newAvatarForAuthor({ displayName, githubUsername: author.githubUsername }, author.githubEmail),
              avatarFallback: `https://gravatar.com/avatar/${await digestStringAsSHA256(displayName)}?d=retro`,

              displayName,

              githubEmail: author.githubEmail,
              githubUsername: author.githubUsername,

              kind: author.kind || 'person',
              role: author.role || 'Contributor',
            }
          }))

          return {
            authors: authorsTransformed,
            url,
          }
        }),
    )).filter(item => item != null)
  },
})
