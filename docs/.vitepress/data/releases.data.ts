import { defineLoader } from 'vitepress'

export interface NightlyBuild {
  conclusion: string
  created_at: string
  head_commit_message: string
  head_sha: string
  html_url: string
  id: number
  name: string
  status: string
  updated_at: string
  workflow_name: string
}

export interface Release {
  body: string
  draft: boolean
  html_url: string
  name: string
  prerelease: boolean
  published_at: string
  tag_name: string
}

export interface ReleasesData {
  nightly: NightlyBuild[]
  nightlyUrl: string
  prerelease: Release[]
  stable: Release[]
}

declare const data: ReleasesData
export { data }

export default defineLoader({
  async load(): Promise<ReleasesData> {
    const nightlyUrl = 'https://github.com/moeru-ai/airi/actions/workflows/release-tamagotchi.yml'

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

      // Fetch nightly builds from GitHub Actions
      let nightlyBuilds: NightlyBuild[] = []
      try {
        // https://docs.github.com/en/rest/actions/workflow-runs?apiVersion=2022-11-28#list-workflow-runs-for-a-repository
        const actionsResponse = await fetch(
          'https://api.github.com/repos/moeru-ai/airi/actions/workflows/release-tamagotchi.yml/runs?status=success&per_page=10',
          {
            headers: {
              'Accept': 'application/vnd.github.v3+json',
              'User-Agent': 'VitePress',
            },
          },
        )

        if (actionsResponse.ok) {
          const actionsData = await actionsResponse.json()
          nightlyBuilds = actionsData.workflow_runs?.map((run: {
            conclusion: string
            created_at: string
            head_commit?: {
              message: string
            }
            head_sha: string
            html_url: string
            id: number
            name: string
            status: string
            updated_at: string
          }) => {
            const shortSha = run.head_sha.substring(0, 7)
            // Get first line of commit message
            const commitMessage = run.head_commit?.message || 'Nightly Build'
            const firstLine = commitMessage.split('\n')[0]

            return {
              conclusion: run.conclusion,
              created_at: run.created_at,
              head_commit_message: commitMessage,
              head_sha: shortSha,
              html_url: run.html_url,
              id: run.id,
              name: firstLine,
              status: run.status,
              updated_at: run.updated_at,
              workflow_name: run.name,
            }
          }) || []
        }
      }
      catch (nightlyError) {
        console.warn('Failed to fetch nightly builds:', nightlyError)
      }

      return {
        nightly: nightlyBuilds,
        nightlyUrl,
        prerelease,
        stable,
      }
    }
    catch (error) {
      console.error('Failed to fetch releases:', error)
      // Return empty data if fetch fails
      return {
        nightly: [],
        nightlyUrl,
        prerelease: [],
        stable: [],
      }
    }
  },
})
