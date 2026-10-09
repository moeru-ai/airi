// Folder sync between local folders and a WeKnora knowledge base.
// The MCP server and the CLI both use this module.

import process from 'node:process'

import { createHash } from 'node:crypto'
import { mkdir, open, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, extname, join, relative } from 'node:path'

// eslint-disable-next-line no-restricted-syntax -- Plain Node.js ESM needs the file extension.
import { isBlockedName, resolveInsideAnyRoot } from '../shared/path-guard.mjs'

// Formats that WeKnora parses. Source code and binaries are skipped.
const SUPPORTED_EXTENSIONS = new Set(['.pdf', '.doc', '.docx', '.ppt', '.pptx', '.xls', '.xlsx', '.md', '.markdown', '.txt', '.csv', '.json', '.html', '.htm', '.epub'])
const MAX_FILE_BYTES = 30 * 1024 * 1024
const MAX_FILES_PER_FOLDER = 2000
const LOCK_STALE_MS = 30 * 60 * 1000
const HTTP_TIMEOUT_MS = 120_000

/** Reads the configuration from the environment. */
export function loadConfig(env = process.env) {
  const appData = env.APPDATA ?? join(env.HOME ?? '.', '.config')
  const config = {
    baseUrl: (env.WEKNORA_BASE_URL ?? 'http://127.0.0.1:8080/api/v1').replace(/\/+$/, ''),
    apiKey: env.WEKNORA_API_KEY ?? '',
    defaultKb: env.WEKNORA_DEFAULT_KB ?? '',
    allowedRoots: (env.ALLOWED_ROOTS ?? '').split(';').map(root => root.trim()).filter(Boolean),
    statePath: env.WEKNORA_FOLDERS_STATE ?? join(appData, 'airi-custom', 'weknora-folders.json'),
  }
  if (!config.apiKey)
    throw new Error('Thiếu WEKNORA_API_KEY.')
  if (config.allowedRoots.length === 0)
    throw new Error('Thiếu ALLOWED_ROOTS (các thư mục cách nhau bởi dấu ;).')
  return config
}

async function readState(config) {
  try {
    return JSON.parse(await readFile(config.statePath, 'utf8'))
  }
  catch (error) {
    if (error.code === 'ENOENT')
      return { folders: {} }
    throw error
  }
}

async function writeState(config, state) {
  await mkdir(dirname(config.statePath), { recursive: true })
  await writeFile(config.statePath, `${JSON.stringify(state, null, 2)}\n`)
}

/** Runs `task` while holding a lock file, so the MCP server and the CLI never sync at the same time. */
async function withLock(config, task) {
  const lockPath = `${config.statePath}.lock`
  await mkdir(dirname(lockPath), { recursive: true })
  const lockAge = await stat(lockPath).then(info => Date.now() - info.mtimeMs, () => undefined)
  if (lockAge !== undefined && lockAge > LOCK_STALE_MS)
    await rm(lockPath, { force: true })
  let handle
  try {
    handle = await open(lockPath, 'wx')
  }
  catch {
    throw new Error('Đang có một lần đồng bộ khác chạy. Thử lại sau ít phút.')
  }
  try {
    return await task()
  }
  finally {
    await handle.close()
    await rm(lockPath, { force: true })
  }
}

function isConnectionError(error) {
  return error?.name === 'TimeoutError' || (error?.name === 'TypeError' && String(error.message).includes('fetch failed'))
}

async function api(config, method, path, body) {
  const response = await fetch(`${config.baseUrl}${path}`, {
    method,
    headers: { 'X-API-Key': config.apiKey, ...(body && !(body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}) },
    body: body instanceof FormData ? body : body && JSON.stringify(body),
    signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
  })
  const json = await response.json().catch(() => ({}))
  return { status: response.status, json }
}

/** Lists supported files under a folder as `{ rel: absolutePath }`, skipping secret and unsupported files. */
async function scanFolder(folder) {
  const files = {}
  const skipped = []
  async function walk(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (isBlockedName(entry.name) || entry.isSymbolicLink())
        continue
      const full = join(dir, entry.name)
      if (entry.isDirectory()) {
        await walk(full)
        continue
      }
      const rel = relative(folder, full).split('\\').join('/')
      if (!SUPPORTED_EXTENSIONS.has(extname(entry.name).toLowerCase()))
        continue
      if ((await stat(full)).size > MAX_FILE_BYTES) {
        skipped.push(`${rel} (quá ${MAX_FILE_BYTES / 1024 / 1024}MB)`)
        continue
      }
      if (Object.keys(files).length >= MAX_FILES_PER_FOLDER)
        throw new Error(`Folder có hơn ${MAX_FILES_PER_FOLDER} file hỗ trợ. Hãy chọn folder nhỏ hơn.`)
      files[rel] = full
    }
  }
  await walk(folder)
  return { files, skipped }
}

async function uploadFile(config, kbId, folderName, rel, fullPath, content) {
  const form = new FormData()
  form.append('file', new Blob([content]), basename(fullPath))
  form.append('fileName', `${folderName}/${rel}`)
  const { status, json } = await api(config, 'POST', `/knowledge-bases/${encodeURIComponent(kbId)}/knowledge/file`, form)
  if (status === 200 && json.data?.id)
    return { knowledgeId: json.data.id, owned: true }
  // The same content already exists in this KB. Keep a reference, but never delete it later.
  if (status === 409 && json.data?.id)
    return { knowledgeId: json.data.id, owned: false }
  throw new Error(`upload ${rel}: HTTP ${status} ${json.message ?? ''}`.trim())
}

async function deleteKnowledge(config, knowledgeId) {
  const { status, json } = await api(config, 'DELETE', `/knowledge/${encodeURIComponent(knowledgeId)}`)
  if (status !== 200 && status !== 404)
    throw new Error(`delete ${knowledgeId}: HTTP ${status} ${json.message ?? ''}`.trim())
}

/** Syncs one registered folder. Returns counters and the errors that did not stop the run. */
async function syncOne(config, folder, entry, maxUploads) {
  const { files, skipped } = await scanFolder(folder)
  const folderName = basename(folder)
  const result = { folder, added: 0, updated: 0, removed: 0, unchanged: 0, pending: 0, skipped, errors: [] }
  let uploads = 0
  for (const [rel, fullPath] of Object.entries(files)) {
    const content = await readFile(fullPath)
    const hash = createHash('sha256').update(content).digest('hex')
    const known = entry.files[rel]
    if (known?.hash === hash) {
      result.unchanged++
      continue
    }
    if (uploads >= maxUploads) {
      result.pending++
      continue
    }
    try {
      if (known?.owned)
        await deleteKnowledge(config, known.knowledgeId)
      entry.files[rel] = { hash, ...await uploadFile(config, entry.kbId, folderName, rel, fullPath, content) }
      uploads++
      if (known)
        result.updated++
      else
        result.added++
    }
    catch (error) {
      // WeKnora is down: stop now instead of failing every file.
      if (isConnectionError(error))
        throw new Error(`Không kết nối được WeKnora tại ${config.baseUrl}. WeKnora đã chạy chưa?`)
      result.errors.push(String(error?.message ?? error))
    }
  }
  for (const [rel, known] of Object.entries(entry.files)) {
    if (rel in files)
      continue
    try {
      if (known.owned)
        await deleteKnowledge(config, known.knowledgeId)
      delete entry.files[rel]
      result.removed++
    }
    catch (error) {
      result.errors.push(String(error?.message ?? error))
    }
  }
  entry.lastSync = new Date().toISOString()
  return result
}

/** Registers a folder inside ALLOWED_ROOTS, then runs its first sync. */
export async function addFolder(config, path, kbId, maxUploads = Infinity) {
  const kb = kbId || config.defaultKb
  if (!kb)
    throw new Error('Chưa có KB: truyền kb hoặc đặt WEKNORA_DEFAULT_KB.')
  const { real } = await resolveInsideAnyRoot(config.allowedRoots, path)
  if (!(await stat(real)).isDirectory())
    throw new Error('Đường dẫn không phải thư mục.')
  return withLock(config, async () => {
    const state = await readState(config)
    state.folders[real] ??= { kbId: kb, addedAt: new Date().toISOString(), files: {} }
    const result = await syncOne(config, real, state.folders[real], maxUploads)
    await writeState(config, state)
    return result
  })
}

/** Syncs every registered folder, or only `onlyPath` when given. */
export async function syncFolders(config, onlyPath, maxUploads = Infinity) {
  return withLock(config, async () => {
    const state = await readState(config)
    const results = []
    for (const [folder, entry] of Object.entries(state.folders)) {
      if (onlyPath && folder !== onlyPath)
        continue
      results.push(await syncOne(config, folder, entry, maxUploads).catch(error => ({ folder, errors: [String(error?.message ?? error)] })))
      await writeState(config, state)
    }
    return results
  })
}

/** Lists registered folders with their KB, file count, and last sync time. */
export async function listFolders(config) {
  const state = await readState(config)
  return Object.entries(state.folders).map(([folder, entry]) => ({ folder, kbId: entry.kbId, files: Object.keys(entry.files).length, lastSync: entry.lastSync }))
}

/** Stops watching a folder. The documents stay in the knowledge base. */
export async function removeFolder(config, path) {
  return withLock(config, async () => {
    const state = await readState(config)
    const key = Object.keys(state.folders).find(folder => folder.toLowerCase() === path.toLowerCase())
    if (!key)
      throw new Error('Folder này chưa được theo dõi.')
    delete state.folders[key]
    await writeState(config, state)
    return key
  })
}

/** Formats a sync result for the model or the console. */
export function formatResult(result) {
  const lines = [`${result.folder}: +${result.added ?? 0} mới, ~${result.updated ?? 0} cập nhật, -${result.removed ?? 0} xoá, ${result.unchanged ?? 0} giữ nguyên`]
  if (result.pending)
    lines.push(`  còn ${result.pending} file chờ, hãy gọi sync_folders lần nữa`)
  if (result.skipped?.length)
    lines.push(`  bỏ qua: ${result.skipped.slice(0, 10).join(', ')}`)
  if (result.errors?.length)
    lines.push(`  lỗi (${result.errors.length}): ${result.errors.slice(0, 5).join(' | ')}`)
  return lines.join('\n')
}
