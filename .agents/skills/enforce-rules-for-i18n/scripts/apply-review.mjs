// Applies a review of the pending translations: approves the good ones, and deletes
// the rejected ones. The review is in crowdin-review-decisions.json in the current directory:
//   { "approve": [{ languageId, file, key, text }], "reject": [{ languageId, file, key, text, reason }] }
//
// Without flags it only matches each reviewed translation in Crowdin and prints the plan.
// --approve approves the good ones. --delete-rejected deletes the rejected ones, after it
// backs them up to a timestamped crowdin-rejected-backup-*.json in the current directory.
// Both flags can be used together. Any unmatched entry stops the run before a change.
//
// Usage: CROWDIN_PERSONAL_TOKEN=... node <repo>/.agents/skills/enforce-rules-for-i18n/scripts/apply-review.mjs [--approve] [--delete-rejected]

import process from 'node:process'

import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const PROJECT_ID = process.env.CROWDIN_PROJECT_ID ?? '816610'
const API = 'https://api.crowdin.com/api/v2'
const approveFlag = process.argv.includes('--approve')
const deleteFlag = process.argv.includes('--delete-rejected')
const token = process.env.CROWDIN_PERSONAL_TOKEN
if (!token) {
  console.error('Set CROWDIN_PERSONAL_TOKEN first.')
  process.exit(1)
}

const here = process.cwd()
const { approve: APPROVE, reject: REJECT } = JSON.parse(readFileSync(join(here, 'crowdin-review-decisions.json'), 'utf8'))

async function request(method, path, { params = {}, body } = {}) {
  const url = new URL(`${API}${path}`)
  for (const [key, value] of Object.entries(params))
    url.searchParams.set(key, String(value))
  for (let attempt = 0; ; attempt++) {
    const response = await fetch(url, {
      method,
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: body && JSON.stringify(body),
    })
    if (response.status === 429 && attempt < 5) {
      await new Promise(resolve => setTimeout(resolve, 2000 * (attempt + 1)))
      continue
    }
    if (!response.ok)
      throw new Error(`${method} ${url.pathname} -> ${response.status}: ${await response.text()}`)
    return response.status === 204 ? undefined : response.json()
  }
}

async function listAll(path, params = {}) {
  const items = []
  for (let offset = 0; ; offset += 500) {
    const page = await request('GET', path, { params: { ...params, limit: 500, offset } })
    items.push(...page.data.map(item => item.data))
    if (page.data.length < 500)
      return items
  }
}

const files = await listAll(`/projects/${PROJECT_ID}/files`)
const fileIds = new Map(files.map(file => [file.path.replace('/packages/i18n/src/locales/en/', ''), file.id]))
const strings = await listAll(`/projects/${PROJECT_ID}/strings`)
const stringIds = new Map(strings.map(string => [`${string.fileId}\0${string.identifier}`, string.id]))

/** Finds the Crowdin translation with exactly this text, or undefined. */
async function match(entry) {
  const stringId = stringIds.get(`${fileIds.get(entry.file)}\0${entry.key}`)
  if (!stringId)
    return undefined
  const translations = await listAll(`/projects/${PROJECT_ID}/translations`, { stringId, languageId: entry.languageId })
  const translation = translations.find(item => item.text === entry.text)
  return translation && { ...entry, stringId, translationId: translation.id }
}

const approveMatches = []
const rejectMatches = []
const unmatched = []
for (const [entries, matches] of [[APPROVE, approveMatches], [REJECT, rejectMatches]]) {
  for (const entry of entries) {
    const found = await match(entry)
    if (found)
      matches.push(found)
    else
      unmatched.push(entry)
  }
}

console.log(`Approve: ${approveMatches.length}/${APPROVE.length} matched`)
console.log(`Reject: ${rejectMatches.length}/${REJECT.length} matched`)
if (unmatched.length > 0) {
  console.error('\nUnmatched, nothing changed:')
  for (const entry of unmatched)
    console.error(`  ${entry.languageId} ${entry.file} ${entry.key}: ${JSON.stringify(entry.text)}`)
  process.exit(1)
}
console.log('All matched.')

if (!approveFlag && !deleteFlag) {
  console.log('Dry run. Add --approve and/or --delete-rejected to change Crowdin.')
  process.exit(0)
}

if (approveFlag) {
  for (const entry of approveMatches)
    await request('POST', `/projects/${PROJECT_ID}/approvals`, { body: { translationId: entry.translationId } })
  console.log(`Approved ${approveMatches.length}.`)
}

if (deleteFlag) {
  const backup = join(here, `crowdin-rejected-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`)
  writeFileSync(backup, JSON.stringify(rejectMatches, null, 2))
  for (const entry of rejectMatches)
    await request('DELETE', `/projects/${PROJECT_ID}/translations/${entry.translationId}`)
  console.log(`Deleted ${rejectMatches.length}. Backup: ${backup}`)
}
