import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const publicDirectory = resolve(import.meta.dirname, '..', 'public')

describe('cloudflare Pages routing', () => {
  it('keeps missing static assets as 404 responses while preserving the /ui SPA fallback', async () => {
    // ROOT CAUSE:
    //
    // Without a top-level 404.html, Cloudflare Pages treats every missing file
    // as an SPA navigation and returns index.html with 200. Missing hashed
    // assets are then cached as HTML under their immutable asset URLs.
    //
    // We keep the SPA rewrite scoped to /ui/* and provide the top-level 404
    // document that makes every other missing file return HTTP 404.
    const [notFoundPage, redirects] = await Promise.all([
      readFile(resolve(publicDirectory, '404.html'), 'utf8'),
      readFile(resolve(publicDirectory, '_redirects'), 'utf8'),
    ])

    expect(notFoundPage).toContain('<title>Page not found</title>')
    expect(redirects).toContain('/ui/* / 200')
  })
})
