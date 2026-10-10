import { describe, expect, it } from 'vitest'

import { releaseRepositoryEndpoints, resolveReleaseRepository } from './release-repository'

describe('release repository routing', () => {
  it('keeps upstream defaults when no build override exists', () => {
    expect(resolveReleaseRepository()).toBe('moeru-ai/airi')
    expect(resolveReleaseRepository(' ')).toBe('moeru-ai/airi')
  })

  it('routes API, fallback feed, assets, and tag parsing to the same fork', () => {
    expect(releaseRepositoryEndpoints('le-firehawk/airi')).toEqual({
      api: 'https://api.github.com/repos/le-firehawk/airi/releases?per_page=100',
      atom: 'https://github.com/le-firehawk/airi/releases.atom',
      download: 'https://github.com/le-firehawk/airi/releases/download',
      tagMarker: '/le-firehawk/airi/releases/tag/',
    })
  })

  it('rejects URLs, traversal, and malformed repositories instead of redirecting requests', () => {
    for (const value of ['https://example.com/a', 'owner/../repo', '../repo', 'owner/repo?token=a', 'owner/repo/extra'])
      expect(() => resolveReleaseRepository(value)).toThrow('owner/repository')
  })
})
