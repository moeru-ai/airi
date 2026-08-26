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

export interface NightlyBuild {
  id: number
  name: string
  html_url: string
  created_at: string
  updated_at: string
  status: string
  conclusion: string
  workflow_name: string
  head_sha: string
  head_commit_message: string
}

export interface ReleasesData {
  stable: Release[]
  prerelease: Release[]
  nightly: NightlyBuild[]
  nightlyUrl: string
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
            id: number
            name: string
            head_sha: string
            html_url: string
            created_at: string
            updated_at: string
            status: string
            conclusion: string
            head_commit?: {
              message: string
            }
          }) => {
            const shortSha = run.head_sha.substring(0, 7)
            // Get first line of commit message
            const commitMessage = run.head_commit?.message || 'Nightly Build'
            const firstLine = commitMessage.split('\n')[0]

            return {
              id: run.id,
              name: firstLine,
              html_url: run.html_url,
              created_at: run.created_at,
              updated_at: run.updated_at,
              status: run.status,
              conclusion: run.conclusion,
              workflow_name: run.name,
              head_sha: shortSha,
              head_commit_message: commitMessage,
            }
          }) || []
        }
      }
      catch (nightlyError) {
        console.warn('Failed to fetch nightly builds:', nightlyError)
      }

      return {
        stable,
        prerelease,
        nightly: nightlyBuilds,
        nightlyUrl,
      }
    }
    catch (error) {
      console.error('Failed to fetch releases:', error)
      // Return empty data if fetch fails
      return {
        stable: [],
        prerelease: [],
        nightly: [],
        nightlyUrl,
      }
    }
  },
})
