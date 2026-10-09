#!/usr/bin/env node
// Read-only MCP server (stdio) that lets AIRI look at projects in one workspace folder.
// It has no write tools. AIRI runs MCP tools without approval, so this server must stay read-only.
// It has no dependencies, so it runs on any Node.js >= 20 without an install step.

import process from 'node:process'

import { execFile } from 'node:child_process'
import { readdir, readFile, realpath, stat } from 'node:fs/promises'
import { basename, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { createInterface } from 'node:readline'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

const ROOT = resolve(process.env.WORKSPACE_ROOT ?? process.argv[2] ?? process.cwd())
const SERVER_INFO = { name: 'workspace-reader', version: '1.0.0' }
const DEFAULT_PROTOCOL_VERSION = '2025-06-18'
const MAX_FILE_BYTES = 200_000
const MAX_OUTPUT_CHARS = 50_000
const MAX_DIR_ENTRIES = 500
const DEFAULT_MAX_LINES = 400
const DEFAULT_LOG_COUNT = 15
const MAX_LOG_COUNT = 100
const GIT_TIMEOUT_MS = 10_000

// Names that can hold secrets, or that are too big to be useful. They are hidden and refused.
const BLOCKED_SEGMENTS = new Set(['.git', 'node_modules', '.open-next', '.next', '.turbo', 'account-info.md', 'settings.local.json', 'id_rsa', 'id_ed25519'])
const BLOCKED_PATTERNS = [/^\.env(?!\.example$)(\..*)?$/i, /\.local\.md$/i, /\.(pem|key|p12|pfx)$/i]
const BLOCKED_PATH_PARTS = [`.claude${sep}local`]
// Keep the same secret files out of git output.
const GIT_EXCLUDES = [':(exclude,glob)**/.env', ':(exclude,glob)**/.env.*', ':(exclude,glob)**/*.local.md', ':(exclude,glob)**/account-info.md']

function isBlockedName(name) {
  return BLOCKED_SEGMENTS.has(name.toLowerCase()) || BLOCKED_PATTERNS.some(pattern => pattern.test(name))
}

function truncate(text, limit = MAX_OUTPUT_CHARS) {
  return text.length > limit ? `${text.slice(0, limit)}\n… (đã cắt bớt, còn ${text.length - limit} ký tự)` : text
}

/** Resolves a user path inside ROOT and refuses escapes, symlink escapes, and secret files. */
async function resolveSafe(userPath = '.') {
  const target = resolve(ROOT, userPath)
  const real = await realpath(target)
  const rootReal = await realpath(ROOT)
  const rel = relative(rootReal, real)
  if (rel.startsWith('..') || isAbsolute(rel))
    throw new Error('Đường dẫn nằm ngoài workspace.')
  if (rel.split(sep).some(isBlockedName) || BLOCKED_PATH_PARTS.some(part => rel.includes(part)))
    throw new Error('File hoặc thư mục này bị chặn vì có thể chứa bí mật.')
  return { real, rel: rel || '.' }
}

async function git(projectPath, args) {
  const { real } = await resolveSafe(projectPath)
  const { stdout } = await execFileAsync('git', ['-C', real, ...args], { timeout: GIT_TIMEOUT_MS, maxBuffer: 10 * 1024 * 1024 })
  return truncate(stdout.trim() || '(trống)')
}

const tools = {
  list_projects: {
    description: 'Liệt kê các dự án (thư mục con) trong workspace, kèm nhánh git hiện tại nếu có.',
    inputSchema: { type: 'object', properties: {} },
    async run() {
      const entries = await readdir(ROOT, { withFileTypes: true })
      const lines = await Promise.all(entries
        .filter(entry => entry.isDirectory() && !isBlockedName(entry.name))
        .map(async (entry) => {
          const branch = await execFileAsync('git', ['-C', join(ROOT, entry.name), 'branch', '--show-current'], { timeout: GIT_TIMEOUT_MS })
            .then(({ stdout }) => stdout.trim(), () => '')
          return branch ? `${entry.name} (nhánh: ${branch})` : entry.name
        }))
      return lines.join('\n') || '(không có dự án)'
    },
  },
  list_dir: {
    description: 'Liệt kê file và thư mục trong một đường dẫn (tương đối với workspace).',
    inputSchema: { type: 'object', properties: { path: { type: 'string', description: 'Ví dụ: "airi/packages"' } }, required: ['path'] },
    async run({ path }) {
      const { real } = await resolveSafe(path)
      const entries = (await readdir(real, { withFileTypes: true })).filter(entry => !isBlockedName(entry.name))
      const lines = entries.slice(0, MAX_DIR_ENTRIES).map(entry => `${entry.isDirectory() ? '[dir] ' : ''}${entry.name}`)
      if (entries.length > MAX_DIR_ENTRIES)
        lines.push(`… còn ${entries.length - MAX_DIR_ENTRIES} mục`)
      return lines.join('\n') || '(thư mục trống)'
    },
  },
  read_file: {
    description: 'Đọc nội dung một file văn bản. Có thể chọn dòng bắt đầu và số dòng tối đa.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        startLine: { type: 'number', description: 'Dòng bắt đầu, tính từ 1' },
        maxLines: { type: 'number', description: `Mặc định ${DEFAULT_MAX_LINES}` },
      },
      required: ['path'],
    },
    async run({ path, startLine = 1, maxLines = DEFAULT_MAX_LINES }) {
      const { real, rel } = await resolveSafe(path)
      if ((await stat(real)).size > MAX_FILE_BYTES)
        throw new Error(`File lớn hơn ${MAX_FILE_BYTES} byte. Hãy đọc file khác hoặc dùng git_diff.`)
      const content = await readFile(real, 'utf8')
      if (content.includes('\0'))
        throw new Error('Đây là file nhị phân.')
      const lines = content.split(/\r?\n/)
      const from = Math.max(1, Math.floor(startLine))
      const slice = lines.slice(from - 1, from - 1 + Math.max(1, Math.floor(maxLines)))
      return truncate(`${rel} (dòng ${from}–${from + slice.length - 1} / ${lines.length})\n${slice.join('\n')}`)
    },
  },
  find_files: {
    description: 'Tìm file theo tên trong một dự án git (dùng git ls-files, không phân biệt hoa thường).',
    inputSchema: { type: 'object', properties: { project: { type: 'string' }, query: { type: 'string' } }, required: ['project', 'query'] },
    async run({ project, query }) {
      const files = (await git(project, ['ls-files'])).split('\n')
      const needle = String(query).toLowerCase()
      const matches = files.filter(file => file.toLowerCase().includes(needle) && !file.split('/').some(isBlockedName))
      return matches.slice(0, MAX_DIR_ENTRIES).join('\n') || '(không tìm thấy)'
    },
  },
  git_status: {
    description: 'Xem git status và nhánh hiện tại của một dự án.',
    inputSchema: { type: 'object', properties: { project: { type: 'string' } }, required: ['project'] },
    run: ({ project }) => git(project, ['status', '--short', '--branch']),
  },
  git_log: {
    description: 'Xem các commit gần nhất của một dự án.',
    inputSchema: { type: 'object', properties: { project: { type: 'string' }, count: { type: 'number' } }, required: ['project'] },
    run: ({ project, count = DEFAULT_LOG_COUNT }) =>
      git(project, ['log', `-${Math.min(MAX_LOG_COUNT, Math.max(1, Math.floor(count)))}`, '--format=%h %ad %an: %s', '--date=short']),
  },
  git_diff: {
    description: 'Xem thay đổi chưa commit của một dự án (staged=true để xem phần đã stage).',
    inputSchema: { type: 'object', properties: { project: { type: 'string' }, staged: { type: 'boolean' } }, required: ['project'] },
    run: ({ project, staged = false }) => git(project, ['diff', ...(staged ? ['--staged'] : []), '--', '.', ...GIT_EXCLUDES]),
  },
}

async function handle(request) {
  const { method, params } = request
  if (method === 'initialize') {
    return { protocolVersion: params?.protocolVersion ?? DEFAULT_PROTOCOL_VERSION, capabilities: { tools: {} }, serverInfo: SERVER_INFO }
  }
  if (method === 'ping')
    return {}
  if (method === 'tools/list') {
    return { tools: Object.entries(tools).map(([name, tool]) => ({ name, description: tool.description, inputSchema: tool.inputSchema })) }
  }
  if (method === 'tools/call') {
    const tool = tools[params?.name]
    if (!tool)
      throw Object.assign(new Error(`Không có tool ${params?.name}`), { code: -32602 })
    try {
      return { content: [{ type: 'text', text: await tool.run(params.arguments ?? {}) }] }
    }
    catch (error) {
      return { content: [{ type: 'text', text: `Lỗi: ${String(error?.message ?? error)}` }], isError: true }
    }
  }
  throw Object.assign(new Error(`Method not found: ${method}`), { code: -32601 })
}

function reply(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`)
}

createInterface({ input: process.stdin }).on('line', async (line) => {
  if (!line.trim())
    return
  let request
  try {
    request = JSON.parse(line)
  }
  catch {
    reply({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } })
    return
  }
  // Notifications have no id and need no reply.
  if (request.id === undefined)
    return
  try {
    reply({ jsonrpc: '2.0', id: request.id, result: await handle(request) })
  }
  catch (error) {
    reply({ jsonrpc: '2.0', id: request.id, error: { code: error.code ?? -32603, message: error.message } })
  }
})

process.stderr.write(`[${SERVER_INFO.name}] root: ${ROOT} (${basename(ROOT)})\n`)
