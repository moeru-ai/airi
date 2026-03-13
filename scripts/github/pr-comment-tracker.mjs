import fs from 'node:fs'
import path from 'node:path'

const REPO = 'moeru-ai/airi'
const CATALOG_PATH = 'docs/FULL_UPSTREAM_PR_CATALOG.md'
const AGENT_LOGINS = ['gemini-code-assist', 'gemini-code-assist[bot]']
const BOT_POSTFIX = '[bot]'
const DELAY_MS = 1000

const delay = ms => new Promise(resolve => setTimeout(resolve, ms))

async function fetchWithRetry(url, retries = 2) {
  for (let i = 0; i <= retries; i++) {
    try {
      const response = await fetch(url, {
        headers: {
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'PR-Comment-Tracker-Bot',
        },
      })

      if (response.ok)
        return await response.json()
      if (response.status === 403) {
        const reset = response.headers.get('x-ratelimit-reset')
        console.warn(`Rate limited. Reset at ${reset ? new Date(reset * 1000).toLocaleTimeString() : 'unknown'}`)
        if (i < retries) {
          console.log(`Waiting 5s before retry ${i + 1}...`)
          await delay(5000)
          continue
        }
      }
      console.error(`Error ${response.status} for ${url}`)
      return null
    }
    catch (err) {
      console.error(`Fetch failed for ${url}: ${err.message}`)
      if (i < retries)
        await delay(2000)
    }
  }
  return null
}

function parseCatalog(content) {
  const prRegex = /\| #(\d+) \|/g
  const prNumbers = []
  let match
  while ((match = prRegex.exec(content)) !== null) {
    prNumbers.push(Number.parseInt(match[1], 10))
  }
  return [...new Set(prNumbers)]
}

async function getPRData(prNumber) {
  const url = `https://api.github.com/repos/${REPO}/issues/${prNumber}/comments`
  const comments = await fetchWithRetry(url)
  if (!comments)
    return { prNumber, uniqueUsers: [], lastFeedback: null }

  const uniqueUsers = [...new Set(comments.map(c => c.user.login))]

  const feedbackComments = comments
    .filter(c => !AGENT_LOGINS.includes(c.user.login))
    .filter(c => c.user.login !== 'github-actions[bot]')
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))

  const lastFeedback = feedbackComments[0]

  return {
    prNumber,
    uniqueUsers,
    lastFeedback: lastFeedback
      ? {
          user: lastFeedback.user.login,
          date: lastFeedback.created_at,
          body: lastFeedback.body.replace(/\n/g, ' ').replace(/\|/g, '\\|').substring(0, 150) + (lastFeedback.body.length > 150 ? '...' : ''),
        }
      : null,
  }
}

async function run() {
  const fullPath = path.resolve(process.cwd(), CATALOG_PATH)
  if (!fs.existsSync(fullPath)) {
    console.error(`Catalog not found at ${fullPath}`)
    return
  }

  let content = fs.readFileSync(fullPath, 'utf8')
  const prNumbers = parseCatalog(content)

  console.log(`Analyzing ${prNumbers.length} PRs: ${prNumbers.join(', ')}`)

  const summary = []
  for (const prNum of prNumbers) {
    process.stdout.write(`PR #${prNum}... `)
    const data = await getPRData(prNum)
    summary.push(data)

    if (data.lastFeedback) {
      process.stdout.write(`Feedback from ${data.lastFeedback.user}\n`)

      const dateStr = new Date(data.lastFeedback.date).toISOString().split('T')[0]
      const feedbackStr = `**${data.lastFeedback.user}** (${dateStr}): ${data.lastFeedback.body}`

      const rowRegex = new RegExp(`(\\| #${prNum} \\| [^|]+ \\| )([^|]*)( \\| )`, 'g')
      content = content.replace(rowRegex, `$1${feedbackStr}$3`)
    }
    else {
      process.stdout.write(`No new feedback\n`)
    }
    await delay(DELAY_MS)
  }

  fs.writeFileSync(fullPath, content)
  console.log(`\nSuccess: Catalog updated at ${CATALOG_PATH}`)

  console.log('\n--- PR COMMENTER SUMMARY REPORT ---')
  for (const item of summary) {
    const humanCommenters = item.uniqueUsers.filter(u => !u.endsWith(BOT_POSTFIX) && !AGENT_LOGINS.includes(u))
    console.log(`PR #${item.prNumber}: [${item.uniqueUsers.length} total] ${item.uniqueUsers.join(', ')}`)
    if (humanCommenters.length > 0) {
      console.log(`  Humans: ${humanCommenters.join(', ')}`)
    }
  }
}

run().catch(console.error)
