import { defineLoader } from 'vitepress'

export interface Release {
  name: string
  tag_name: string
  html_url: string
  published_at: string
  prerelease: boolean
  draft: boolean
  body: string
}

export interface ReleasesData {
  stable: Release[]
  prerelease: Release[]
}

declare const data: ReleasesData
export { data }

export default defineLoader({
  async load(): Promise<ReleasesData> {
    try {
      // Fetch releases from GitHub API
      const releasesResponse = await fetch('https://api.github.com/repos/moeru-ai/airi/releases', {
        headers: {
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'VitePress',
        },
      })

      if (!releasesResponse.ok) {
        throw new Error(`GitHub API request failed: ${releasesResponse.statusText}`)
      }

      const releases: Release[] = await releasesResponse.json()

      // Filter out drafts and mark beta/alpha as prereleases
      const publishedReleases = releases.filter(r => !r.draft).map((r) => {
        // Mark releases with beta or alpha in tag_name as prereleases
        const isPrerelease = r.prerelease
          || r.tag_name.includes('-beta')
          || r.tag_name.includes('-alpha')

        return {
          ...r,
          prerelease: isPrerelease,
        }
      })

      // Separate stable and prerelease
      const stable = publishedReleases
        .filter(r => !r.prerelease)
        .slice(0, 10) // Get latest 10 stable releases

      const prerelease = publishedReleases
        .filter(r => r.prerelease)
        .slice(0, 10) // Get latest 10 prereleases

      return {
        stable,
        prerelease,
      }
    }
    catch (error) {
      console.error('Failed to fetch releases:', error)
      // Return empty data if fetch fails
      return {
        stable: [],
        prerelease: [],
      }
    }
  },
})
