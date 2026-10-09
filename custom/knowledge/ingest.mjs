// Folder indexing: scan, diff by SHA-256, then extract → chunk → profile → vision → embed.
// Work runs as background jobs, one at a time, so tool calls return quickly.

/* eslint-disable no-restricted-syntax -- Plain Node.js ESM needs file extensions. */
import { execFile } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { readdir, readFile, realpath, stat } from 'node:fs/promises'
import { basename, extname, join, relative, resolve } from 'node:path'
import { promisify } from 'node:util'

import { isBlockedName, isBlockedRelativePath, resolveInsideAnyRoot } from '../shared/path-guard.mjs'
import { chunkCode, chunkText } from './chunk.mjs'
import { deleteDocumentChunks, insertChunks, saveEmbedding, transaction } from './db.mjs'
import { embeddingText } from './embed.mjs'
import { extractDocument, IMAGE_MEDIA_TYPES, SUPPORTED_EXTENSIONS } from './extract.mjs'
import { profileDocument, summaryChunk } from './profile.mjs'
import { invalidateVectorCache } from './search.mjs'
import { describeImage, imageChunks } from './vision.mjs'

const execFileAsync = promisify(execFile)

const CODE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.vue', '.svelte', '.go', '.py', '.java', '.kt', '.rs', '.cs', '.php', '.rb', '.sql', '.sh', '.ps1', '.yaml', '.yml', '.toml', '.css', '.scss'])
const SKIPPED_DIRS = new Set(['dist', 'build', 'out', 'coverage', 'vendor', '.cache', '__pycache__'])
const SKIPPED_FILES = /(?:^|\/)(?:pnpm-lock\.yaml|package-lock\.json|yarn\.lock|bun\.lockb?|.*\.min\.(?:js|css))$/
const MAX_CODE_BYTES = 300 * 1024
const MAX_FILES_PER_FOLDER = 5000
const MAX_IMAGES_PER_DOC = 10
const GIT_TIMEOUT_MS = 30_000

/** Makes a folder slug for wiki paths, for example "Tài liệu dự án" → "tai-lieu-du-an". */
export function slugify(text) {
  return text.normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/gi, 'd').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'folder'
}

/**
 * Lower-case real path for comparisons. Windows paths can differ only in case or in 8.3 short names
 * (C:\Users\ABCDEF~1). A folder that no longer exists falls back to its resolved path.
 */
async function canonicalPath(path) {
  return (await realpath(path).catch(() => resolve(path))).toLowerCase()
}

function kindOf(rel) {
  const extension = extname(rel).toLowerCase()
  if (IMAGE_MEDIA_TYPES[extension])
    return 'image'
  if (SUPPORTED_EXTENSIONS.has(extension))
    return 'doc'
  return CODE_EXTENSIONS.has(extension) ? 'code' : undefined
}

async function walk(root, dir = root, files = []) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (isBlockedName(entry.name) || SKIPPED_DIRS.has(entry.name) || entry.isSymbolicLink())
      continue
    const full = join(dir, entry.name)
    if (entry.isDirectory())
      await walk(root, full, files)
    else
      files.push(relative(root, full).split('\\').join('/'))
  }
  return files
}

/** Lists indexable files as relative paths. Code comes from `git ls-files` when the folder is a repository. */
export async function listFolderFiles(folderPath, includeCode) {
  let files = await walk(folderPath)
  if (includeCode) {
    const tracked = await execFileAsync('git', ['-C', folderPath, 'ls-files'], { timeout: GIT_TIMEOUT_MS, maxBuffer: 64 * 1024 * 1024 })
      .then(({ stdout }) => stdout.split('\n').filter(Boolean), () => undefined)
    if (tracked)
      files = [...new Set([...files.filter(file => kindOf(file) !== 'code'), ...tracked])]
  }
  return files
    .filter(file => !isBlockedRelativePath(file) && !SKIPPED_FILES.test(file) && !file.split('/').some(part => SKIPPED_DIRS.has(part)))
    .filter(file => kindOf(file) === 'doc' || kindOf(file) === 'image' || (includeCode && kindOf(file) === 'code'))
    .slice(0, MAX_FILES_PER_FOLDER)
}

/**
 * Creates the indexer. `context` holds `{ db, roots, embedder, llm, models }`.
 * Jobs run one after another in this process.
 */
export function createIndexer(context) {
  const { db, roots, embedder, llm, models } = context
  let queue = Promise.resolve()

  function updateJob(id, fields) {
    const current = db.prepare('SELECT * FROM jobs WHERE id = ?').get(id)
    const progress = { ...JSON.parse(current.progress), ...fields.progress }
    db.prepare('UPDATE jobs SET status = ?, progress = ?, error = ?, updated_at = ? WHERE id = ?')
      .run(fields.status ?? current.status, JSON.stringify(progress), fields.error ?? current.error, new Date().toISOString(), id)
  }

  /** Queues `work(jobId)` as a background job and returns the job id at once. */
  function startJob(kind, folderId, work) {
    const id = randomUUID().slice(0, 8)
    const now = new Date().toISOString()
    db.prepare('INSERT INTO jobs (id, kind, folder_id, status, created_at, updated_at) VALUES (?, ?, ?, \'queued\', ?, ?)').run(id, kind, folderId, now, now)
    queue = queue.then(async () => {
      updateJob(id, { status: 'running' })
      try {
        await work(id)
        updateJob(id, { status: 'done' })
      }
      catch (error) {
        updateJob(id, { status: 'failed', error: String(error?.message ?? error) })
      }
    })
    return id
  }

  async function indexFile(folder, rel, hash, existing) {
    const path = join(folder.path, rel)
    const kind = kindOf(rel)
    const title = basename(rel)
    const extracted = kind === 'code'
      ? { text: await readFile(path, 'utf8') }
      : await extractDocument(path, { withImages: Boolean(llm) })
    const chunks = kind === 'code'
      ? chunkCode(extracted.text, rel).map(chunk => ({ ...chunk, type: 'code' }))
      : chunkText(extracted.text).map(chunk => ({ ...chunk, type: 'text' }))

    for (const image of (extracted.images ?? []).slice(0, MAX_IMAGES_PER_DOC))
      chunks.push(...imageChunks(image.name, await describeImage(llm, models.vision, image)))
    const profile = llm && kind !== 'code' ? await profileDocument(llm, models.profile, { title, text: [extracted.text, ...chunks.filter(chunk => chunk.type.startsWith('image_')).map(chunk => `<${chunk.type}>${chunk.content}</${chunk.type}>`)].join('\n') }) : undefined
    if (profile)
      chunks.unshift(summaryChunk(profile))

    const embedModel = kind === 'code' ? models.embedCode : models.embed
    const vectors = embedder && chunks.length > 0
      ? await embedder(chunks.map(chunk => embeddingText({ title, ...chunk })), { model: embedModel, inputType: 'document' })
      : []

    transaction(db, () => {
      const now = new Date().toISOString()
      let docId = existing?.id
      if (docId) {
        deleteDocumentChunks(db, docId)
        db.prepare('UPDATE documents SET hash = ?, kind = ?, title = ?, units = ?, summary = ?, gist = ?, topics = ?, doc_type = ?, status = \'indexed\', error = NULL, updated_at = ? WHERE id = ?')
          .run(hash, kind, title, extracted.units ?? null, profile?.summary ?? null, profile?.gist ?? null, profile ? JSON.stringify(profile.topics) : null, profile?.docType ?? null, now, docId)
      }
      else {
        docId = Number(db.prepare('INSERT INTO documents (folder_id, path, rel, kind, hash, title, units, summary, gist, topics, doc_type, status, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, \'indexed\', ?)')
          .run(folder.id, path, rel, kind, hash, title, extracted.units ?? null, profile?.summary ?? null, profile?.gist ?? null, profile ? JSON.stringify(profile.topics) : null, profile?.docType ?? null, now).lastInsertRowid)
      }
      const ids = insertChunks(db, docId, title, chunks)
      vectors.forEach((vector, index) => saveEmbedding(db, ids[index], embedModel, vector))
    })
  }

  function recordError(folder, rel, hash, existing, error) {
    const message = String(error?.message ?? error).slice(0, 500)
    const now = new Date().toISOString()
    if (existing)
      db.prepare('UPDATE documents SET status = \'error\', error = ?, hash = ?, updated_at = ? WHERE id = ?').run(message, hash, now, existing.id)
    else
      db.prepare('INSERT INTO documents (folder_id, path, rel, kind, hash, title, status, error, updated_at) VALUES (?, ?, ?, ?, ?, ?, \'error\', ?, ?)').run(folder.id, join(folder.path, rel), rel, kindOf(rel), hash, basename(rel), message, now)
  }

  function deleteDocument(docId) {
    transaction(db, () => {
      deleteDocumentChunks(db, docId)
      db.prepare('DELETE FROM documents WHERE id = ?').run(docId)
    })
  }

  async function syncFolder(folder, jobId) {
    const files = await listFolderFiles(folder.path, Boolean(folder.include_code))
    const known = new Map(db.prepare('SELECT id, rel, hash, status FROM documents WHERE folder_id = ?').all(folder.id).map(row => [row.rel, row]))
    const progress = { total: files.length, done: 0, indexed: 0, unchanged: 0, removed: 0, errors: 0 }
    for (const rel of files) {
      const path = join(folder.path, rel)
      const existing = known.get(rel)
      known.delete(rel)
      try {
        if (kindOf(rel) === 'code' && (await stat(path)).size > MAX_CODE_BYTES) {
          progress.done++
          continue
        }
        const hash = createHash('sha256').update(await readFile(path)).digest('hex')
        if (existing?.hash === hash && existing.status === 'indexed') {
          progress.unchanged++
        }
        else {
          await indexFile(folder, rel, hash, existing)
          progress.indexed++
        }
      }
      catch (error) {
        progress.errors++
        recordError(folder, rel, 'error', existing, error)
      }
      progress.done++
      updateJob(jobId, { progress: { ...progress, current: rel } })
    }
    for (const gone of known.values()) {
      deleteDocument(gone.id)
      progress.removed++
    }
    invalidateVectorCache()
    db.prepare('UPDATE folders SET last_sync = ? WHERE id = ?').run(new Date().toISOString(), folder.id)
    updateJob(jobId, { progress: { ...progress, current: null } })
  }

  return {
    /** Registers a folder inside the allowed roots and queues its first sync. */
    async addFolder(path, includeCode = false) {
      const { real } = await resolveInsideAnyRoot(roots, path)
      if (!(await stat(real)).isDirectory())
        throw new Error('Đường dẫn không phải thư mục.')
      let folder = db.prepare('SELECT * FROM folders WHERE path = ?').get(real)
      if (!folder) {
        const base = slugify(basename(real))
        const taken = new Set(db.prepare('SELECT slug FROM folders').all().map(row => row.slug))
        let slug = base
        for (let suffix = 2; taken.has(slug); suffix++)
          slug = `${base}-${suffix}`
        db.prepare('INSERT INTO folders (path, slug, include_code, added_at) VALUES (?, ?, ?, ?)').run(real, slug, includeCode ? 1 : 0, new Date().toISOString())
        folder = db.prepare('SELECT * FROM folders WHERE path = ?').get(real)
      }
      else if (Boolean(folder.include_code) !== includeCode) {
        db.prepare('UPDATE folders SET include_code = ? WHERE id = ?').run(includeCode ? 1 : 0, folder.id)
        folder.include_code = includeCode ? 1 : 0
      }
      return { folder, jobId: startJob('sync', folder.id, jobId => syncFolder(folder, jobId)) }
    },

    /** Queues a sync for one folder, or for every folder. Returns the job ids. */
    async syncFolders(onlyPath) {
      const target = onlyPath && await canonicalPath(onlyPath)
      const folders = db.prepare('SELECT * FROM folders').all().filter(folder => !target || folder.path.toLowerCase() === target)
      return folders.map(folder => ({ folder, jobId: startJob('sync', folder.id, jobId => syncFolder(folder, jobId)) }))
    },

    /** Removes a folder and its index. Wiki files on disk stay. */
    async removeFolder(path) {
      const target = await canonicalPath(path)
      const folder = db.prepare('SELECT * FROM folders').all().find(row => row.path.toLowerCase() === target)
      if (!folder)
        throw new Error('Folder này chưa được thêm.')
      for (const doc of db.prepare('SELECT id FROM documents WHERE folder_id = ?').all(folder.id))
        deleteDocument(doc.id)
      db.prepare('DELETE FROM wiki_fts WHERE folder_id = ?').run(folder.id)
      db.prepare('DELETE FROM folders WHERE id = ?').run(folder.id)
      invalidateVectorCache()
      return folder
    },

    startJob,
    updateJob,
    /** Resolves when every queued job has finished. Used by tests. */
    idle: () => queue,
  }
}
