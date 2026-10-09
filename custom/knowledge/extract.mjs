// Text and image extraction for office documents, PDFs, and images, so the model can read them.
// PDF uses unpdf (pdf.js). DOCX, PPTX, and XLSX are ZIP files of XML, so JSZip and a few regexes are enough.

import { readFile, stat } from 'node:fs/promises'
import { basename, extname } from 'node:path'

import JSZip from 'jszip'

import { extractText, getDocumentProxy } from 'unpdf'

// Raster formats that Claude vision accepts. Vector formats (emf, wmf, svg) are skipped.
export const IMAGE_MEDIA_TYPES = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp' }
export const SUPPORTED_EXTENSIONS = new Set(['.pdf', '.docx', '.pptx', '.xlsx', '.md', '.markdown', '.txt', '.csv', '.json', '.html', '.htm', ...Object.keys(IMAGE_MEDIA_TYPES)])
export const MAX_FILE_BYTES = 50 * 1024 * 1024
// Claude accepts images up to 5 MB each.
const MAX_IMAGE_BYTES = 5 * 1024 * 1024
const MAX_IMAGES_PER_DOC = 20
const MAX_SHEET_ROWS = 2000
const MAX_CACHE_ENTRIES = 300
const XML_ENTITIES = { lt: '<', gt: '>', amp: '&', quot: '"', apos: '\'' }

// Extracted text by path, reused while the file's size and mtime stay the same.
const cache = new Map()

function decodeXml(text) {
  return text.replace(/&(#x[\da-f]+|#\d+|\w+);/gi, (match, code) => {
    if (code[0] === '#')
      return String.fromCodePoint(code[1].toLowerCase() === 'x' ? Number.parseInt(code.slice(2), 16) : Number(code.slice(1)))
    return XML_ENTITIES[code] ?? match
  })
}

/** Turns WordprocessingML or DrawingML into plain text: one line per paragraph. */
function xmlToText(xml, paragraphTag) {
  return decodeXml(xml
    .replace(/<(?:w|a):tab\/>/g, '\t')
    .replace(/<(?:w|a):br[^>]*\/>/g, '\n')
    .replace(new RegExp(`</${paragraphTag}>`, 'g'), '\n')
    .replace(/<[^>]+>/g, ''))
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** Reads one attribute value from an XML start tag. */
function xmlAttribute(tag, name) {
  return new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1]
}

function numberIn(name) {
  return Number(/(\d+)\.xml$/.exec(name)?.[1] ?? 0)
}

/** Cell text without decoding entities, so the outer `xmlToText` decodes it exactly once. */
function cellText(cellXml) {
  return cellXml.replace(/<\/w:p>/g, ' ').replace(/<[^>]+>/g, '').replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim()
}

/**
 * Turns each Word table into Markdown rows, so a row stays together through chunking.
 * WeKnora's docreader does the same (docreader/parser/docx_parser.py).
 */
function docxTablesToMarkdown(xml) {
  return xml.replace(/<w:tbl>[\s\S]*?<\/w:tbl>/g, (table) => {
    const rows = [...table.matchAll(/<w:tr[\s>][\s\S]*?<\/w:tr>/g)].map(([row]) => [...row.matchAll(/<w:tc[\s>][\s\S]*?<\/w:tc>/g)].map(([cell]) => cellText(cell)))
    if (rows.length === 0)
      return ''
    const lines = rows.map(cells => `| ${cells.join(' | ')} |`)
    lines.splice(1, 0, `|${' --- |'.repeat(rows[0].length)}`)
    // The closing paragraph tag makes `xmlToText` put the table on its own lines.
    return `</w:p>${lines.join('</w:p>')}</w:p>`
  })
}

/** Collects embedded raster images, for example `word/media/image1.png`, for vision captioning. */
async function zipImages(zip, prefix) {
  const names = Object.keys(zip.files).filter(name => name.startsWith(prefix) && IMAGE_MEDIA_TYPES[extname(name).toLowerCase()]).sort()
  const images = []
  for (const name of names.slice(0, MAX_IMAGES_PER_DOC)) {
    const data = await zip.file(name).async('nodebuffer')
    if (data.length <= MAX_IMAGE_BYTES)
      images.push({ name: name.slice(prefix.length), mediaType: IMAGE_MEDIA_TYPES[extname(name).toLowerCase()], data })
  }
  return images
}

async function docxText(zip) {
  const xml = await zip.file('word/document.xml')?.async('string')
  if (!xml)
    throw new Error('File DOCX không có word/document.xml.')
  return { text: xmlToText(docxTablesToMarkdown(xml), 'w:p'), images: await zipImages(zip, 'word/media/') }
}

async function pptxText(zip) {
  const slides = Object.keys(zip.files).filter(name => /^ppt\/slides\/slide\d+\.xml$/.test(name)).sort((a, b) => numberIn(a) - numberIn(b))
  const parts = await Promise.all(slides.map(async (name, index) => `## Slide ${index + 1}\n${xmlToText(await zip.file(name).async('string'), 'a:p')}`))
  return { text: parts.join('\n\n'), units: `${slides.length} slide`, images: await zipImages(zip, 'ppt/media/') }
}

async function xlsxText(zip) {
  const shared = [...((await zip.file('xl/sharedStrings.xml')?.async('string')) ?? '').matchAll(/<si>(.*?)<\/si>/gs)].map(match => decodeXml(match[1].replace(/<[^>]+>/g, '')))
  const workbook = (await zip.file('xl/workbook.xml')?.async('string')) ?? ''
  const rels = (await zip.file('xl/_rels/workbook.xml.rels')?.async('string')) ?? ''
  // Attributes are read one by one, because their order inside a tag is not fixed.
  const targets = Object.fromEntries([...rels.matchAll(/<Relationship\s[^>]*>/g)].map(([tag]) => [xmlAttribute(tag, 'Id'), xmlAttribute(tag, 'Target')]))
  const sheets = [...workbook.matchAll(/<sheet\s[^>]*>/g)].map(([tag]) => [tag, xmlAttribute(tag, 'name') ?? '', xmlAttribute(tag, 'r:id')])
  const parts = []
  for (const [, name, relId] of sheets) {
    const target = targets[relId]?.replace(/^\/?(xl\/)?/, 'xl/')
    const xml = target && await zip.file(target)?.async('string')
    if (!xml)
      continue
    const rows = []
    for (const [, rowXml] of xml.matchAll(/<row\b[^>]*>(.*?)<\/row>/gs)) {
      if (rows.length >= MAX_SHEET_ROWS)
        break
      const cells = [...rowXml.matchAll(/<c\b([^>]*?)(?:\/>|>(.*?)<\/c>)/gs)].map(([, attrs, inner = '']) => {
        const value = /<v>(.*?)<\/v>/s.exec(inner)?.[1] ?? ''
        if (/\bt="s"/.test(attrs))
          return shared[Number(value)] ?? ''
        if (/\bt="inlineStr"/.test(attrs))
          return decodeXml(inner.replace(/<[^>]+>/g, ''))
        return decodeXml(value)
      })
      rows.push(cells.join('\t'))
    }
    parts.push(`## Sheet: ${decodeXml(name)}\n${rows.join('\n')}`)
  }
  return { text: parts.join('\n\n'), units: `${sheets.length} sheet` }
}

async function pdfText(buffer) {
  const pdf = await getDocumentProxy(new Uint8Array(buffer))
  const { totalPages, text } = await extractText(pdf, { mergePages: false })
  return { text: text.map((page, index) => `--- Trang ${index + 1} ---\n${page.trim()}`).join('\n\n'), units: `${totalPages} trang` }
}

function htmlText(html) {
  return decodeXml(html.replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, '').replace(/<\/(p|div|h\d|li|tr)>/gi, '\n').replace(/<[^>]+>/g, '')).replace(/\n{3,}/g, '\n\n').trim()
}

/**
 * Extracts one supported file. Returns `{ text, units?, images? }`.
 * Images (`{ name, mediaType, data }`) come back only with `withImages`, and that call skips the
 * text cache, because image buffers are too large to keep in memory.
 */
export async function extractDocument(path, { withImages = false } = {}) {
  const extension = extname(path).toLowerCase()
  if (!SUPPORTED_EXTENSIONS.has(extension))
    throw new Error(`Chưa hỗ trợ định dạng ${extension || '(không có đuôi)'}.`)
  const info = await stat(path)
  if (info.size > MAX_FILE_BYTES)
    throw new Error(`File lớn hơn ${MAX_FILE_BYTES / 1024 / 1024}MB.`)
  const cached = cache.get(path)
  if (!withImages && cached && cached.size === info.size && cached.mtimeMs === info.mtimeMs)
    return cached.result

  const buffer = await readFile(path)
  let result
  if (IMAGE_MEDIA_TYPES[extension])
    result = { text: '', images: buffer.length <= MAX_IMAGE_BYTES ? [{ name: basename(path), mediaType: IMAGE_MEDIA_TYPES[extension], data: buffer }] : [] }
  else if (extension === '.pdf')
    result = await pdfText(buffer)
  else if (extension === '.docx')
    result = await docxText(await JSZip.loadAsync(buffer))
  else if (extension === '.pptx')
    result = await pptxText(await JSZip.loadAsync(buffer))
  else if (extension === '.xlsx')
    result = await xlsxText(await JSZip.loadAsync(buffer))
  else if (extension === '.html' || extension === '.htm')
    result = { text: htmlText(buffer.toString('utf8')) }
  else
    result = { text: buffer.toString('utf8') }

  if (cache.size >= MAX_CACHE_ENTRIES)
    cache.delete(cache.keys().next().value)
  const { images: _images, ...textOnly } = result
  cache.set(path, { size: info.size, mtimeMs: info.mtimeMs, result: textOnly })
  return withImages ? result : textOnly
}
