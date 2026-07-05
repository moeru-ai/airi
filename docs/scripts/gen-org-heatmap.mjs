// Generates an org-wide commit activity heatmap SVG for the animaios org.
//
// Flow:
//   1. GitHub GraphQL API: list all non-archived repos under `animaios`.
//   2. For each repo: GraphQL query the recent commit history (first 100 commits
//      on the default branch) and the total commit count on the default branch
//      since the 365-day window started.
//   3. Aggregate:
//      - last 365 days -> Map<YYYY-MM-DD, n>     (heatmap)
//      - top-N repos    -> sorted [{repo, count}] (breakdown bars)
//   4. Render a single SVG: GitHub-style calendar heatmap on top, per-repo
//      breakdown bars below, footer with totals + date.
//
// Pagination caveat: We only fetch the first 100 recent commits per repo for
// the daily heatmap distribution signal. The breakdown bar counts use the
// exact `totalCommitsForDefaultBranch`-style count via `totalCount`.
// TODO: paginate history for full daily counts if a repo exceeds 100
// commits in the window (high-activity repos will under-report daily cells).

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import process from 'node:process'

const ORG = 'animaios'
const TOKEN = process.env.GITHUB_TOKEN
const OUT_PATH = resolve(process.argv[2] || './docs/content/public/assets/org-heatmap.svg')

if (!TOKEN) {
  console.error('error: GITHUB_TOKEN env var is required')
  process.exit(1)
}

const GRAPHQL_ENDPOINT = 'https://api.github.com/graphql'
const WINDOW_DAYS = 365
const TOP_N_BREAKDOWN = 12

// AnimAIOS-inspired pink/purple palette. Empty = neutral gray.
// Empty days use the GitHub ebedf0-style neutral.
const COLOR_EMPTY = '#161b22'
// 4 buckets of pink intensities, from dim to vivid.
const COLOR_SCALE = ['#3a1f2d', '#7a2d51', '#c63578', '#ff6b9d']
const COLOR_TEXT = '#c9d1d9'
const COLOR_TEXT_DIM = '#6e7681'
const COLOR_BG = '#0d1117'
const COLOR_BAR_TRACK = '#21262d'
const COLOR_HEADER = '#ffd1e8'
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

async function main() {
  const until = new Date()
  const since = new Date(until)
  since.setUTCDate(since.getUTCDate() - (WINDOW_DAYS - 1))
  since.setUTCHours(0, 0, 0, 0)

  const sinceISO = since.toISOString()
  const untilISO = until.toISOString()

  console.log(`fetching repos for org=${ORG} window=${sinceISO} -> ${untilISO}`)

  const repos = await listOrgRepos()
  console.log(`found ${repos.length} non-archived repos`)

  let totalCommits = 0
  const perDay = new Map()
  const perRepo = []

  for (const name of repos) {
    try {
      const commits = await fetchRepoCommits(name, sinceISO, untilISO)
      for (const day of commits.days) {
        perDay.set(day, (perDay.get(day) || 0) + 1)
      }
      totalCommits += commits.total
      perRepo.push({ name, count: commits.total })
    }
    catch (err) {
      console.warn(`skipping repo ${name}: ${err.message}`)
    }
  }

  perRepo.sort((a, b) => b.count - a.count)
  const top = perRepo.slice(0, TOP_N_BREAKDOWN)
  const maxRepoCount = top.length ? top[0].count : 1

  const svg = renderSVG({
    since,
    until,
    perDay,
    top,
    maxRepoCount,
    totalCommits,
    repoCount: repos.length,
  })

  mkdirSync(dirname(OUT_PATH), { recursive: true })
  writeFileSync(OUT_PATH, svg, 'utf8')
  console.log(`wrote ${OUT_PATH} (${(svg.length / 1024).toFixed(1)} KB)`)
}

async function graphql(query, variables) {
  const res = await fetch(GRAPHQL_ENDPOINT, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${TOKEN}`,
      'Accept': 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'User-Agent': 'animaios-org-heatmap-generator',
    },
    body: JSON.stringify({ query, variables }),
  })

  if (!res.ok) {
    const txt = await res.text()
    throw new Error(`GraphQL HTTP ${res.status}: ${txt.slice(0, 200)}`)
  }

  const json = await res.json()
  if (json.errors?.length) {
    const messages = json.errors.map(e => e.message).join('; ')
    throw new Error(`GraphQL errors: ${messages}`)
  }
  return json.data
}

async function listOrgRepos() {
  const query = /* graphql */ `
    query ($org: String!, $after: String) {
      organization(login: $org) {
        repositories(first: 100, after: $after, orderBy: {field: PUSHED_AT, direction: DESC}) {
          nodes {
            name
            isArchived
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
      }
    }
  `

  const names = []
  let cursor = null
  for (let i = 0; i < 30; i++) {
    const data = await graphql(query, { org: ORG, after: cursor })
    const page = data.organization.repositories
    for (const node of page.nodes) {
      if (!node.isArchived)
        names.push(node.name)
    }
    if (!page.pageInfo.hasNextPage)
      break
    cursor = page.pageInfo.endCursor
  }
  return names
}

async function fetchRepoCommits(repo, sinceISO, untilISO) {
  const query = /* graphql */ `
    query ($owner: String!, $name: String!, $since: GitTimestamp!, $until: GitTimestamp!) {
      repository(owner: $owner, name: $name) {
        defaultBranchRef {
          target {
            ... on Commit {
              history(first: 100, since: $since, until: $until) {
                totalCount
                edges {
                  node {
                    committedDate
                  }
                }
              }
            }
          }
        }
      }
    }
  `

  const data = await graphql(query, { owner: ORG, name: repo, since: sinceISO, until: untilISO })
  const history = data.repository?.defaultBranchRef?.target?.history
  if (!history)
    return { total: 0, days: [] }

  const total = history.totalCount

  // days-of-activity distribution: one bucket per ISO date.
  const days = []
  const seen = new Set()
  for (const edge of history.edges) {
    const d = edge.node.committedDate.slice(0, 10)
    if (!seen.has(d)) {
      seen.add(d)
      days.push(d)
    }
  }

  return { total, days }
}

// ---------------------------------------------------------------------------
// SVG rendering
// ---------------------------------------------------------------------------

function renderSVG({ since, until, perDay, top, maxRepoCount, totalCommits, repoCount }) {
  // Build a 53-week (columns) x 7-day (rows) grid of activity counts.
  const grid = buildGrid(perDay, since, until)
  const maxCell = Math.max(1, ...grid.flat().filter(c => c != null))

  // Layout constants
  const CELL = 11
  const GAP = 3
  const STEP = CELL + GAP
  const MARGIN_LEFT = 36
  const MARGIN_TOP = 28
  const COLS = 53
  const ROWS = 7

  const gridW = MARGIN_LEFT + COLS * STEP
  const gridH = MARGIN_TOP + ROWS * STEP + 6

  // Breakdown block layout
  const BLOCK_GAP = 28
  const BLOCK_TITLE_H = 28
  const ROW_H = 20
  const NAME_W = 150
  const BAR_W = 280
  const BAR_H = 10
  const MAX_LABEL_W = NAME_W

  const blockX = MARGIN_LEFT
  const blockY = gridH + BLOCK_GAP
  const blockH = BLOCK_TITLE_H + top.length * ROW_H

  const footerH = 28
  const totalW = gridW
  const totalH = blockY + blockH + footerH + 16

  // Month labels above grid
  const monthLabels = computeMonthLabels(since, until)
  // Day-of-week labels left of grid (Mon / Wed / Fri only)
  const dayLabels = [
    { row: 1, text: 'Mon' },
    { row: 3, text: 'Wed' },
    { row: 5, text: 'Fri' },
  ]

  const parts = []
  parts.push(`<?xml version="1.0" encoding="UTF-8"?>`)
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${totalW}" height="${totalH}" viewBox="0 0 ${totalW} ${totalH}" role="img" aria-label="animaios org commit activity over the last 365 days">`,
  )
  parts.push(`<rect width="${totalW}" height="${totalH}" fill="${COLOR_BG}"/>`)

  // Title
  parts.push(
    `<text x="${MARGIN_LEFT}" y="18" fill="${COLOR_HEADER}" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif" font-size="13" font-weight="600">animaios org activity · last ${WINDOW_DAYS} days</text>`,
  )

  // Month labels
  for (const m of monthLabels) {
    const x = MARGIN_LEFT + m.col * STEP
    const y = MARGIN_TOP - 10
    parts.push(
      `<text x="${x}" y="${y}" fill="${COLOR_TEXT_DIM}" font-family="ui-sans-serif, system-ui, sans-serif" font-size="10">${m.text}</text>`,
    )
  }

  // Day-of-week labels
  for (const d of dayLabels) {
    parts.push(
      `<text x="${MARGIN_LEFT - 8}" y="${MARGIN_TOP + d.row * STEP + 9}" text-anchor="end" fill="${COLOR_TEXT_DIM}" font-family="ui-sans-serif, system-ui, sans-serif" font-size="10">${d.text}</text>`,
    )
  }

  // Heatmap cells
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const value = grid[r][c]
      const x = MARGIN_LEFT + c * STEP
      const y = MARGIN_TOP + r * STEP
      const fill = colorFor(value, maxCell)
      const title = value != null ? `${value} commits` : 'no activity'
      parts.push(
        `<rect x="${x}" y="${y}" width="${CELL}" height="${CELL}" rx="2" ry="2" fill="${fill}"><title>${escapeXML(title)}</title></rect>`,
      )
    }
  }

  // Color scale legend (bottom-right of the grid)
  const legendX = gridW - (COLOR_SCALE.length + 1) * STEP
  const legendY = MARGIN_TOP + ROWS * STEP + 8
  parts.push(
    `<text x="${legendX - 8}" y="${legendY + 9}" text-anchor="end" fill="${COLOR_TEXT_DIM}" font-family="ui-sans-serif, system-ui, sans-serif" font-size="10">Less</text>`,
  )
  parts.push(renderCell(legendX, legendY, COLOR_EMPTY))
  for (let i = 0; i < COLOR_SCALE.length; i++) {
    parts.push(renderCell(legendX + (i + 1) * STEP, legendY, COLOR_SCALE[i]))
  }
  parts.push(
    `<text x="${legendX + (COLOR_SCALE.length + 1) * STEP + 4}" y="${legendY + 9}" fill="${COLOR_TEXT_DIM}" font-family="ui-sans-serif, system-ui, sans-serif" font-size="10">More</text>`,
  )

  // --- Breakdown block ---
  parts.push(
    `<text x="${blockX}" y="${blockY + 18}" fill="${COLOR_HEADER}" font-family="ui-sans-serif, system-ui, sans-serif" font-size="12" font-weight="600">Top active repos this year</text>`,
  )

  let y = blockY + BLOCK_TITLE_H
  for (const repo of top) {
    const widthFrac = maxRepoCount > 0 ? repo.count / maxRepoCount : 0
    const barActualW = Math.round(BAR_W * widthFrac)
    const nameText = truncate(repo.name, MAX_LABEL_W, 11)

    // track
    parts.push(
      `<rect x="${blockX + NAME_W}" y="${y + 4}" width="${BAR_W}" height="${BAR_H}" rx="3" ry="3" fill="${COLOR_BAR_TRACK}"/>`,
    )
    // filled bar
    if (barActualW > 0) {
      parts.push(
        `<rect x="${blockX + NAME_W}" y="${y + 4}" width="${barActualW}" height="${BAR_H}" rx="3" ry="3" fill="${COLOR_SCALE[3]}"/>`,
      )
    }
    // count text
    parts.push(
      `<text x="${blockX + NAME_W + BAR_W + 8}" y="${y + 13}" fill="${COLOR_TEXT}" font-family="ui-sans-serif, system-ui, sans-serif" font-size="11">${repo.count}</text>`,
    )
    // repo name
    parts.push(
      `<text x="${blockX}" y="${y + 13}" fill="${COLOR_TEXT}" font-family="ui-sans-serif, system-ui, sans-serif" font-size="11">${escapeXML(nameText)}</text>`,
    )

    y += ROW_H
  }

  // --- Footer ---
  const footerY = totalH - 12
  const dateText = formatDate(until)
  parts.push(
    `<text x="${MARGIN_LEFT}" y="${footerY}" fill="${COLOR_TEXT_DIM}" font-family="ui-sans-serif, system-ui, sans-serif" font-size="10">animaios org activity · ${totalCommits} commits across ${repoCount} repos · ${dateText} · refreshed 4x daily by CI</text>`,
  )

  parts.push('</svg>')
  return parts.join('\n')
}

function renderCell(x, y, fill) {
  return `<rect x="${x}" y="${y}" width="11" height="11" rx="2" ry="2" fill="${fill}"/>`
}

function buildGrid(perDay, since, until) {
  const ROWS = 7
  const COLS = 53
  const grid = Array.from({ length: ROWS }, () => Array.from({ length: COLS }).fill(null))

  // Walk the window day-by-day.
  const cursor = new Date(since)
  cursor.setUTCHours(0, 0, 0, 0)
  const end = new Date(until)
  end.setUTCHours(23, 59, 59, 999)

  let col = 0
  // If the very first day is not a Monday, fill out the empty leading cells so the
  // grid aligns cleanly with the week-of-year structure.
  const firstDow = (cursor.getUTCDay() + 6) % 7 // Mon=0..Sun=6

  // We want column 0 to begin at the start of the ISO week containing the since date,
  // so we back the cursor up to the Monday of that week.
  cursor.setUTCDate(cursor.getUTCDate() - firstDow)

  let safety = 0
  while (cursor.getTime() <= end.getTime() && safety < 53 * 7 + 7) {
    const dow = (cursor.getUTCDay() + 6) % 7
    if (col >= 0 && col < COLS && dow >= 0 && dow < ROWS) {
      const iso = cursor.toISOString().slice(0, 10)
      const inside = cursor.getTime() >= since.getTime()
      if (inside) {
        const n = perDay.get(iso) || 0
        // bucket: shows "had commits" days as the day-bucket count (>=1),
        // "no activity" days as null.
        grid[dow][col] = n
      }
      if (dow === 6)
        col++
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1)
    safety++
  }

  return grid
}

function computeMonthLabels(since, until) {
  const labels = []
  const cursor = new Date(since)
  cursor.setUTCDate(1)
  cursor.setUTCHours(0, 0, 0, 0)

  // Bridge: to find column index, compute weeks since the Monday-of-since-week.
  const monAnchor = new Date(since)
  monAnchor.setUTCHours(0, 0, 0, 0)
  monAnchor.setUTCDate(monAnchor.getUTCDate() - ((monAnchor.getUTCDay() + 6) % 7))

  let lastMonth = -1
  const end = new Date(until)
  end.setUTCMonth(end.getUTCMonth() + 1)
  let safety = 0
  while (cursor.getTime() < end.getTime() && safety < 24) {
    const m = cursor.getUTCMonth()
    if (m !== lastMonth) {
      const weeksSince = Math.floor((cursor.getTime() - monAnchor.getTime()) / (7 * 24 * 3600 * 1000))
      if (weeksSince >= 0 && weeksSince < 53) {
        labels.push({ col: weeksSince, text: MONTH_NAMES[m] })
      }
      lastMonth = m
    }
    cursor.setUTCMonth(cursor.getUTCMonth() + 1)
    safety++
  }
  return labels
}

function colorFor(value, maxCell) {
  if (value == null || value === 0)
    return COLOR_EMPTY
  // log-ish scaling for nicer gradient over wide activity ranges
  const ratio = value / maxCell
  if (ratio < 0.1)
    return COLOR_SCALE[0]
  if (ratio < 0.3)
    return COLOR_SCALE[1]
  if (ratio < 0.6)
    return COLOR_SCALE[2]
  return COLOR_SCALE[3]
}

function escapeXML(s) {
  return String(s).replace(/[&<>]/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
  })[c])
}

function truncate(s, maxPx, fontSize) {
  // Approximate char-width truncation so repository names fit their slot.
  const approxChar = fontSize * 0.6
  const maxChars = Math.floor(maxPx / approxChar)
  if (s.length <= maxChars)
    return s
  return `${s.slice(0, Math.max(1, maxChars - 1))}…`
}

function formatDate(d) {
  return d.toISOString().slice(0, 10)
}
