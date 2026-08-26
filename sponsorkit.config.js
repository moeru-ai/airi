import { readFile } from 'node:fs/promises'
import { extname } from 'node:path'

import { defineConfig, tierPresets } from 'sponsorkit'

const avatarMimeTypeMap = {
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
}

const kofiProvider = {
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
        const mime = avatarMimeTypeMap[ext] || 'image/png'
        avatarUrl = `data:${mime};base64,${buffer.toString('base64')}`
      }
      return {
        createdAt: item.createdAt || new Date().toISOString(),
        monthlyDollars: Number(item.monthlyDollars || 0),
        privacyLevel: 'PUBLIC',
        provider: 'kofi',
        sponsor: {
          avatarUrl,
          linkUrl: item.linkUrl || '',
          login: item.login || item.name,
          name: item.name,
          type: 'User',
        },
        tierName: item.tierName,
      }
    }))
  },
  name: 'kofi',
}

export default defineConfig({
  formats: ['svg', 'json'],
  includePastSponsors: true,
  padding: {
    bottom: 8,
    top: 18,
  },
  providers: ['patreon', 'opencollective', kofiProvider],
  renderer: 'tiers',
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
      padding: {
        bottom: 6,
        top: 8,
      },
      preset: tierPresets.base,
      title: 'Supporters',
    },
  ],
  width: 960,
})
