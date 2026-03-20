import fs from 'node:fs'
import path from 'node:path'

const DEFAULT_REPO = 'moeru-ai/airi'
const DEFAULT_AUTHOR = 'dasilva333'
const DEFAULT_CATALOG_PATH = 'docs/FULL_UPSTREAM_PR_CATALOG.md'
const AGENT_LOGINS = new Set(['gemini-code-assist', 'gemini-code-assist[bot]', 'github-actions[bot]'])

function getArg(name, fallback) {
  const prefix = `--${name}=`
  const match = process.argv.find(arg => arg.startsWith(prefix))
  return match ? match.slice(prefix.length) : fallback
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      'Accept': 'application/vnd.github+json',
      'User-Agent': 'airi-pr-status-report',
    },
  })

  if (!response.ok)
    throw new Error(`GitHub API ${response.status} for ${url}`)

  return response.json()
}

function parseCatalogFeedback(content) {
  const baseline = new Map()
  const regex = /\| #(\d+) \| .*? \| .*? \| \*\*([^*]+)\*\* \((\d{4}-\d{2}-\d{2})\):/g

  for (const match of content.matchAll(regex)) {
    baseline.set(Number.parseInt(match[1], 10), {
      user: match[2],
      date: match[3],
    })
  }

  return baseline
}

function summarizeStatus(issue, pull) {
  if (pull.merged_at)
    return 'merged'
  return issue.state === 'open' ? 'open' : 'closed'
}

function printSection(title, items, formatter) {
  if (items.length === 0)
    return

  console.log(`\n${title}`)
  for (const item of items)
    console.log(formatter(item))
}

async function run() {
  const repo = getArg('repo', DEFAULT_REPO)
  const author = getArg('author', DEFAULT_AUTHOR)
  const catalogPath = path.resolve(process.cwd(), getArg('catalog', DEFAULT_CATALOG_PATH))

  const catalogContent = fs.existsSync(catalogPath) ? fs.readFileSync(catalogPath, 'utf8') : ''
  const baseline = parseCatalogFeedback(catalogContent)

  const searchUrl = `https://api.github.com/search/issues?q=repo:${repo}+is:pr+author:${author}&per_page=100`
  const search = await fetchJson(searchUrl)

  const prs = []
  for (const issue of search.items) {
    const [pull, comments] = await Promise.all([
      fetchJson(`https://api.github.com/repos/${repo}/pulls/${issue.number}`),
      fetchJson(`https://api.github.com/repos/${repo}/issues/${issue.number}/comments`),
    ])

    const humanComments = comments
      .filter(comment => !AGENT_LOGINS.has(comment.user.login))
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))

    const latestHuman = humanComments[0] ?? null
    const baselineFeedback = baseline.get(issue.number)
    const hasNewHumanComment = latestHuman
      ? !baselineFeedback || new Date(latestHuman.created_at) > new Date(`${baselineFeedback.date}T00:00:00Z`)
      : false

    prs.push({
      number: issue.number,
      title: issue.title,
      url: issue.html_url,
      status: summarizeStatus(issue, pull),
      updatedAt: issue.updated_at,
      latestHuman,
      hasNewHumanComment,
    })
  }

  prs.sort((a, b) => b.number - a.number)

  const totals = {
    total: prs.length,
    open: prs.filter(pr => pr.status === 'open').length,
    closed: prs.filter(pr => pr.status === 'closed').length,
    merged: prs.filter(pr => pr.status === 'merged').length,
  }

  console.log(`PR status report for ${author} in ${repo}`)
  console.log(`Total: ${totals.total}`)
  console.log(`Open: ${totals.open}`)
  console.log(`Closed: ${totals.closed}`)
  console.log(`Merged: ${totals.merged}`)

  printSection('Open PRs', prs.filter(pr => pr.status === 'open'), pr => `- #${pr.number} ${pr.title}`)

  printSection(
    'New human comments since catalog baseline',
    prs.filter(pr => pr.hasNewHumanComment),
    (pr) => {
      const comment = pr.latestHuman
      const body = comment.body.replace(/\s+/g, ' ').slice(0, 180)
      return `- #${pr.number} by ${comment.user.login} on ${comment.created_at}: ${body}${comment.body.length > 180 ? '...' : ''}`
    },
  )
}

run().catch((error) => {
  console.error(error.message)
  process.exitCode = 1
})
