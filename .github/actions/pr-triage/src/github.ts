import { getOctokit } from '@actions/github'

import * as core from '@actions/core'

type Octokit = ReturnType<typeof getOctokit>

export type PullRequest = Awaited<ReturnType<Octokit['rest']['pulls']['get']>>['data']
export type PullRequestFile = Awaited<ReturnType<Octokit['rest']['pulls']['listFiles']>>['data'][number]

function repositoryParts(repository: string): { owner: string, repo: string } {
  const match = /^([\w.-]+)\/([\w.-]+)$/.exec(repository)
  if (!match)
    throw new Error('GITHUB_REPOSITORY is missing or invalid.')

  return { owner: match[1], repo: match[2] }
}

/**
 * Reads the trusted PR metadata and the files exposed by GitHub's PR files API.
 *
 * GitHub caps this endpoint at 3,000 files, so callers must treat
 * `pr.changed_files > files.length` as an explicitly truncated manifest.
 */
export async function fetchPullRequest(
  repository: string,
  number: number,
  token: string,
): Promise<{ files: PullRequestFile[], pr: PullRequest }> {
  const octokit = getOctokit(token)
  const { owner, repo } = repositoryParts(repository)

  core.info(`Fetching PR metadata: repo=${repository} pr=${number}`)
  const { data: pr } = await octokit.rest.pulls.get({
    owner,
    repo,
    pull_number: number,
  })

  core.info('Fetching changed files with pagination (GitHub API cap: 3000 files)')
  const files: PullRequestFile[] = []
  for (let page = 1; page <= 30; page += 1) {
    const { data: batch } = await octokit.rest.pulls.listFiles({
      owner,
      repo,
      pull_number: number,
      page,
      per_page: 100,
    })
    files.push(...batch)
    if (batch.length < 100)
      break
  }

  core.info(`Fetched PR data: api_files=${files.length} reported_files=${pr.changed_files}`)
  if (files.length === 3000 && pr.changed_files > files.length) {
    core.warning(
      `GitHub PR files API cap reached: api_files=${files.length} reported_files=${pr.changed_files}`,
    )
  }

  return { files, pr }
}

/**
 * Synchronizes only labels owned by PR triage and preserves all other labels.
 *
 * Desired labels are added before stale labels are removed. A partial API
 * failure therefore leaves extra managed labels instead of deleting useful
 * classification state.
 */
export async function syncLabels(options: {
  desired: readonly string[]
  managed: ReadonlySet<string>
  number: number
  repository: string
  token: string
}): Promise<void> {
  const octokit = getOctokit(options.token)
  const { owner, repo } = repositoryParts(options.repository)
  const { data: pr } = await octokit.rest.pulls.get({
    owner,
    repo,
    pull_number: options.number,
  })

  const current = pr.labels.flatMap((label) => {
    if (typeof label === 'string')
      return [label]
    return label.name ? [label.name] : []
  })
  const desired = [...new Set(options.desired)].sort()
  const desiredSet = new Set(desired)
  const remove = current
    .filter(label => options.managed.has(label) && !desiredSet.has(label))
    .sort()

  core.info(
    `Label sync plan: pr=${options.number} desired=${desired.length} remove=${remove.length}`,
  )
  if (desired.length > 0) {
    core.info(`Applying managed labels: ${desired.join(', ')}`)
    await octokit.rest.issues.addLabels({
      owner,
      repo,
      issue_number: options.number,
      labels: desired,
    })
  }

  for (const label of remove) {
    core.info(`Removing managed label: ${label}`)
    await octokit.rest.issues.removeLabel({
      owner,
      repo,
      issue_number: options.number,
      name: label,
    })
  }

  core.info('Label sync completed.')
}
