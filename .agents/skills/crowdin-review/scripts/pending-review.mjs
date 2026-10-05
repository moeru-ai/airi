// Lists the Crowdin translations that wait for review, and flags the ones that fail
// the repository's locale check after approval.
// Read-only. It sends GET requests only and changes nothing in Crowdin.
// Output goes to the current directory. The placeholder rule comes from
// .github/scripts/check-locales.ts, so the script needs Node.js type stripping.
//
// Usage: CROWDIN_PERSONAL_TOKEN=... node <repo>/.agents/skills/crowdin-review/scripts/pending-review.mjs
// Output: crowdin-pending-review.json (all pending) and crowdin-pending-review.md (flagged only).

import process from 'node:process'

import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { placeholders } from '../../../../.github/scripts/check-locales.ts'

const PROJECT_ID = process.env.CROWDIN_PROJECT_ID ?? '816610'
const API = 'https://api.crowdin.com/api/v2'
const token = process.env.CROWDIN_PERSONAL_TOKEN
if (!token) {
  console.error('Set CROWDIN_PERSONAL_TOKEN first.')
  process.exit(1)
}

async function get(path, params = {}) {
  const url = new URL(`${API}${path}`)
  for (const [key, value] of Object.entries(params))
    url.searchParams.set(key, String(value))
  for (let attempt = 0; ; attempt++) {
    const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
    if (response.status === 429 && attempt < 5) {
      await new Promise(resolve => setTimeout(resolve, 2000 * (attempt + 1)))
      continue
    }
    if (!response.ok)
      throw new Error(`GET ${url.pathname}${url.search} -> ${response.status}: ${await response.text()}`)
    return response.json()
  }
}

async function listAll(path, params = {}) {
  const items = []
  for (let offset = 0; ; offset += 500) {
    const page = await get(path, { ...params, limit: 500, offset })
    items.push(...page.data.map(item => item.data))
    if (page.data.length < 500)
      return items
  }
}

const project = (await get(`/projects/${PROJECT_ID}`)).data
const files = await listAll(`/projects/${PROJECT_ID}/files`)
const filePath = new Map(files.map(file => [file.id, file.path.replace('/packages/i18n/src/locales/en/', '')]))
const strings = await listAll(`/projects/${PROJECT_ID}/strings`)
const source = new Map(strings.filter(string => typeof string.text === 'string').map(string => [string.id, string]))

const rows = []
const pending = []
for (const languageId of project.targetLanguageIds) {
  const translations = await listAll(`/projects/${PROJECT_ID}/languages/${languageId}/translations`)
  const approved = new Set()
  for (const file of files) {
    for (const approval of await listAll(`/projects/${PROJECT_ID}/approvals`, { fileId: file.id, languageId }))
      approved.add(approval.translationId)
  }

  const row = { languageId, strings: source.size, translated: 0, approved: 0, pending: 0, placeholders: 0, identical: 0, whitespace: 0 }
  for (const translation of translations) {
    const string = source.get(translation.stringId)
    if (!string || typeof translation.text !== 'string')
      continue
    row.translated++
    if (approved.has(translation.translationId)) {
      row.approved++
      continue
    }

    row.pending++
    const issues = []
    const expected = placeholders(string.text)
    const actual = placeholders(translation.text)
    if (expected.join() !== actual.join()) {
      row.placeholders++
      issues.push(`placeholders: expected [${expected.join(', ')}], found [${actual.join(', ')}]`)
    }
    if (translation.text.trim() === string.text.trim()) {
      row.identical++
      issues.push('same as English')
    }
    if (!translation.text.trim() || translation.text.trim() !== translation.text.replace(/\n$/, '')) {
      row.whitespace++
      issues.push('empty, or extra whitespace at the start or end')
    }
    pending.push({
      languageId,
      file: filePath.get(string.fileId),
      key: string.identifier,
      english: string.text,
      translation: translation.text,
      user: translation.user?.username ?? translation.user?.id,
      createdAt: translation.createdAt,
      issues,
    })
  }
  rows.push(row)
  console.log(`${languageId}: done`)
}

console.log()
console.table(rows)

const here = process.cwd()
writeFileSync(join(here, 'crowdin-pending-review.json'), JSON.stringify(pending, null, 2))

// Only the flagged ones go to the Markdown report, so it stays short enough to read.
const flagged = pending.filter(item => item.issues.length > 0)
const cell = text => text.replace(/\|/g, '\\|').replace(/\n/g, ' ')
const report = [
  `# Pending review with issues (${flagged.length} of ${pending.length})`,
  '',
  '| Language | File | Key | Issues | English | Translation |',
  '|---|---|---|---|---|---|',
  ...flagged.map(item => `| ${item.languageId} | ${item.file} | \`${item.key}\` | ${item.issues.join('<br>')} | ${cell(item.english)} | ${cell(item.translation)} |`),
].join('\n')
writeFileSync(join(here, 'crowdin-pending-review.md'), `${report}\n`)
console.log(`\n${pending.length} pending, ${flagged.length} with issues.`)
console.log(`All pending: ${join(here, 'crowdin-pending-review.json')}`)
console.log(`Issues only: ${join(here, 'crowdin-pending-review.md')}`)
