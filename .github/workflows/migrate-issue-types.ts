/* eslint-disable no-console */
import process from 'node:process'

import { Octokit } from '@octokit/rest'

const IssueTypeMapping = {
  enhancement: 'Feature',
  bug: 'Bug',
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

async function migrate(octokit: Octokit, owner: string, repo: string): Promise<void> {
  const allIssues = await octokit.paginate(octokit.rest.issues.listForRepo, {
    owner,
    repo,
    state: 'all',
    per_page: 100,
  })

  const issues = allIssues.filter(x => !x.pull_request)

  for (const issue of issues) {
    const labels: string[] = []
    for (const label of issue.labels) {
      if (typeof label === 'string')
        labels.push(label)
      else if (label.name)
        labels.push(label.name)
    }
    const typeLabel = labels.find(label => label in IssueTypeMapping)

    if (typeLabel) {
      try {
        const updatedLabels = labels.filter(x => x !== typeLabel)
        await octokit.rest.issues.update({
          owner,
          repo,
          issue_number: issue.number,
          labels: updatedLabels,
          type: IssueTypeMapping[typeLabel as keyof typeof IssueTypeMapping],
        })
        console.log(`Updated #${issue.number}`)
        await sleep(100)
      }
      catch (error) {
        console.error('Failed to update issue #%d: %o', issue.number, error)
      }
    }
  }
}

(async () => {
  const token = process.env.GITHUB_TOKEN
  const repository = process.env.GITHUB_REPOSITORY
  const [owner, repo] = repository?.split('/') || []
  if (!token || !owner || !repo)
    throw new Error('Invalid parameters')

  await migrate(new Octokit({ auth: token }), owner, repo)
})()
