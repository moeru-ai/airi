import { readFile } from 'node:fs/promises'
import { extname } from 'node:path'

import { defineConfig, tierPresets } from 'sponsorkit'

const kofiProvider = {
  name: 'kofi',
  async fetchSponsors() {
    let raw = '[]'
    try {
      raw = await readFile('docs/content/public/assets/sponsors/kofi-supporters.json', 'utf8')
    }
    catch {
      raw = '[]'
    }
    const items = JSON.parse(raw)
    return Promise.all(items.map(async (item) => {
      let avatarUrl = item.avatarUrl || ''
      if (item.avatarPath) {
        const buffer = await readFile(item.avatarPath)
        const ext = extname(item.avatarPath).toLowerCase()
        const mime = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : ext === '.webp' ? 'image/webp' : ext === '.svg' ? 'image/svg+xml' : 'image/png'
        avatarUrl = `data:${mime};base64,${buffer.toString('base64')}`
      }
      return {
        sponsor: {
          type: 'User',
          login: item.login || item.name,
          name: item.name,
          avatarUrl,
          linkUrl: item.linkUrl || '',
        },
        monthlyDollars: Number(item.monthlyDollars || 0),
        provider: 'kofi',
        privacyLevel: 'PUBLIC',
        tierName: item.tierName,
        createdAt: item.createdAt || new Date().toISOString(),
      }
    }))
  },
}

export default defineConfig({
  providers: ['patreon', 'opencollective', kofiProvider],
  renderer: 'tiers',
  width: 960,
  padding: {
    top: 18,
    bottom: 8,
  },
  formats: ['svg', 'json'],
  includePastSponsors: true,
  svgInlineCSS: `
text {
  font-weight: 400;
  font-size: 14px;
  fill: #8b949e;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, Roboto, 'Helvetica Neue', Arial, sans-serif;
}
.sponsorkit-link {
  cursor: pointer;
}
.sponsorkit-tier-title {
  font-weight: 700;
  font-size: 18px;
  fill: #e6edf3;
  letter-spacing: 0.2px;
}
`,
  tiers: [
    {
      title: 'Supporters',
      preset: tierPresets.base,
      padding: {
        top: 8,
        bottom: 6,
      },
    },
  ],
})
