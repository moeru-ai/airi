// MCP tools of the knowledge server: folders, indexing status, search, and reading.
// Wiki tools live in wiki-tools.mjs.

/* eslint-disable no-restricted-syntax -- Plain Node.js ESM needs file extensions. */
import { realpathSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { extname } from 'node:path'

import { truncate } from '../shared/mcp-stdio.mjs'
import { resolveInsideAnyRoot } from '../shared/path-guard.mjs'
import { extractDocument, SUPPORTED_EXTENSIONS } from './extract.mjs'
import { hybridSearch } from './search.mjs'

const MAX_READ_CHARS = 30_000
const MAX_RESULT_CHARS = 900
const MAX_LISTED_DOCS = 200
const RECENT_JOBS = 5

/** Compares Windows paths regardless of case, slash style, and 8.3 short names (C:\Users\ABCDEF~1). */
function pathKey(path) {
  let real = path
  try {
    real = realpathSync.native(path)
  }
  catch {
    // A path that does not exist on disk is compared as written.
  }
  return real.toLowerCase().replace(/\\/g, '/').replace(/\/+$/, '')
}

/** Finds folders by path or slug. Without a value, returns undefined (meaning all folders). */
export function findFolderIds(db, folder) {
  if (!folder)
    return undefined
  const slug = folder.toLowerCase()
  const key = pathKey(folder)
  const ids = db.prepare('SELECT id, path, slug FROM folders').all().filter(row => row.slug === slug || pathKey(row.path) === key).map(row => row.id)
  if (ids.length === 0)
    throw new Error(`Không tìm thấy folder "${folder}". Dùng list_folders để xem danh sách.`)
  return ids
}

function describeJob(job) {
  const progress = JSON.parse(job.progress)
  const counts = progress.total === undefined ? '' : ` ${progress.done}/${progress.total} file (mới ${progress.indexed}, giữ ${progress.unchanged}, xoá ${progress.removed}, lỗi ${progress.errors})`
  return `job ${job.id} [${job.kind}] ${job.status}${counts}${progress.current ? `, đang xử lý ${progress.current}` : ''}${job.error ? `, lỗi: ${job.error}` : ''}`
}

/** Creates the tools. `context` holds `{ db, roots, embedder, indexer }`. */
export function createKnowledgeTools({ db, roots, embedder, indexer }) {
  async function queryVectors(text, folderIds) {
    if (!embedder)
      return new Map()
    const filter = folderIds ? `AND d.folder_id IN (${folderIds.join(',')})` : ''
    const usedModels = db.prepare(`SELECT DISTINCT e.model FROM embeddings e JOIN chunks c ON c.id = e.chunk_id JOIN documents d ON d.id = c.doc_id WHERE 1 = 1 ${filter}`).all().map(row => row.model)
    const vectors = new Map()
    for (const model of usedModels)
      vectors.set(model, (await embedder([text], { model, inputType: 'query' }))[0])
    return vectors
  }

  return {
    add_folder: {
      description: `Thêm một thư mục vào kho tri thức và index nền (tài liệu, ảnh qua vision, và mã nguồn nếu includeCode=true). Chỉ nhận thư mục trong: ${roots.join(', ')}. Chỉ gọi khi người dùng yêu cầu rõ ràng.`,
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Đường dẫn tuyệt đối' },
          includeCode: { type: 'boolean', description: 'Index cả mã nguồn (file trong git ls-files). Dùng cho thư mục dự án.' },
        },
        required: ['path'],
      },
      async run({ path, includeCode = false }) {
        const { folder, jobId } = await indexer.addFolder(path, includeCode)
        return `Đã thêm ${folder.path} (slug: ${folder.slug}). Đang index nền: job ${jobId}. Xem tiến độ bằng index_status.`
      },
    },
    sync_folders: {
      description: 'Index lại các thư mục đã thêm: nạp file mới hoặc đã sửa, bỏ file đã xoá.',
      inputSchema: { type: 'object', properties: { path: { type: 'string', description: 'Chỉ một thư mục (tuỳ chọn)' } } },
      async run({ path }) {
        const jobs = await indexer.syncFolders(path)
        return jobs.map(({ folder, jobId }) => `${folder.slug}: job ${jobId}`).join('\n') || '(chưa có thư mục nào)'
      },
    },
    list_folders: {
      description: 'Liệt kê các thư mục trong kho tri thức.',
      inputSchema: { type: 'object', properties: {} },
      async run() {
        const rows = db.prepare(`
          SELECT f.*, count(d.id) AS docs, sum(d.status = 'error') AS errors
          FROM folders f LEFT JOIN documents d ON d.folder_id = f.id GROUP BY f.id ORDER BY f.slug`).all()
        return rows.map(row => `${row.slug}: ${row.path} — ${row.docs} file${row.errors ? ` (${row.errors} lỗi)` : ''}${row.include_code ? ', có mã nguồn' : ''}, đồng bộ lần cuối ${row.last_sync ?? 'chưa'}`).join('\n') || '(chưa có thư mục nào)'
      },
    },
    remove_folder: {
      description: 'Xoá một thư mục khỏi kho tri thức (xoá index, không xoá file gốc và file wiki).',
      inputSchema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
      async run({ path }) {
        const folder = await indexer.removeFolder(path)
        return `Đã xoá ${folder.path} khỏi kho. File gốc vẫn còn.`
      },
    },
    index_status: {
      description: 'Xem tiến độ index hoặc dựng wiki. Truyền jobId để xem một job, bỏ trống để xem các job gần nhất.',
      inputSchema: { type: 'object', properties: { jobId: { type: 'string' } } },
      async run({ jobId }) {
        const jobs = jobId
          ? db.prepare('SELECT * FROM jobs WHERE id = ?').all(jobId)
          : db.prepare('SELECT * FROM jobs ORDER BY created_at DESC LIMIT ?').all(RECENT_JOBS)
        return jobs.map(describeJob).join('\n') || '(chưa có job nào)'
      },
    },
    search_knowledge: {
      description: 'Tìm trong kho tri thức (kết hợp ngữ nghĩa và từ khoá, gõ không dấu vẫn được). Trả về đoạn trích kèm nguồn. Dùng read_document để đọc đầy đủ.',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string' },
          folder: { type: 'string', description: 'Slug hoặc đường dẫn thư mục (tuỳ chọn)' },
          k: { type: 'number', description: 'Số kết quả, mặc định 8' },
        },
        required: ['query'],
      },
      async run({ query, folder, k = 8 }) {
        const folderIds = findFolderIds(db, folder)
        const results = hybridSearch(db, query, await queryVectors(query, folderIds), { folderIds, k: Math.min(20, Math.max(1, k)) })
        return results.map((result, index) => [
          `[${index + 1}] ${result.path}${result.header ? ` › ${result.header}` : ''} (${result.chunk_type})`,
          truncate(result.content, MAX_RESULT_CHARS),
        ].join('\n')).join('\n\n') || '(không tìm thấy)'
      },
    },
    read_document: {
      description: 'Đọc nội dung một file (pdf, docx, pptx, xlsx, md, txt, html, mã nguồn). Dùng offset để đọc phần tiếp theo.',
      inputSchema: {
        type: 'object',
        properties: { path: { type: 'string' }, offset: { type: 'number', description: 'Vị trí ký tự bắt đầu, mặc định 0' } },
        required: ['path'],
      },
      async run({ path, offset = 0 }) {
        const { real } = await resolveInsideAnyRoot(roots, path)
        const text = SUPPORTED_EXTENSIONS.has(extname(real).toLowerCase())
          ? (await extractDocument(real)).text
          : await readFile(real, 'utf8')
        const start = Math.max(0, Math.floor(offset))
        const end = Math.min(text.length, start + MAX_READ_CHARS)
        const more = end < text.length ? `\n\n… còn tiếp, gọi lại với offset=${end}` : ''
        return `${real} (ký tự ${start}–${end} / ${text.length})\n\n${text.slice(start, end)}${more}`
      },
    },
    list_documents: {
      description: 'Liệt kê tài liệu đã index, kèm tóm tắt một dòng và loại tài liệu.',
      inputSchema: { type: 'object', properties: { folder: { type: 'string' } } },
      async run({ folder }) {
        const folderIds = findFolderIds(db, folder)
        const rows = db.prepare(`SELECT rel, kind, status, gist, doc_type, units, error, folder_id FROM documents ${folderIds ? `WHERE folder_id IN (${folderIds.join(',')})` : ''} ORDER BY rel LIMIT ?`).all(MAX_LISTED_DOCS)
        return rows.map(row => `${row.rel} [${row.doc_type ?? row.kind}${row.units ? `, ${row.units}` : ''}]${row.status === 'error' ? ` LỖI: ${row.error}` : row.gist ? ` — ${row.gist}` : ''}`).join('\n') || '(chưa có tài liệu)'
      },
    },
  }
}
