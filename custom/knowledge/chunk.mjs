// Text and code chunking. A small port of WeKnora's splitter:
// internal/infrastructure/chunker/splitter.go (defaults 512/80, protected spans, table header repeat).

export const DEFAULT_CHUNK_SIZE = 512
export const DEFAULT_CHUNK_OVERLAP = 80
const SEPARATORS = ['\n\n', '\n', '。', '. ']
const MAX_CODE_CHUNK_CHARS = 1500

// Content that must never be split, from WeKnora's protectedPatterns.
const PROTECTED_PATTERNS = [
  /\$\$[\s\S]*?\$\$/g,
  /!\[[^\]\n]{0,200}\]\([^)\n]{1,500}\)/g,
  /\[[^\]\n]{1,200}\]\([^)\n]{1,500}\)/g,
  /```[^\n]*\n[\s\S]*?```/g,
  /`[^`\n]+`/g,
]
const TABLE_ROW = /^ *\|.*\| *$/
const TABLE_SEPARATOR = /^ *\|(?: *:?-{3,}:? *\|)+ *$/
const HEADING = /^(#{1,6}) +(\S.*)$/

/** Finds protected spans as sorted, non-overlapping [start, end) ranges. */
function protectedSpans(text) {
  const spans = PROTECTED_PATTERNS.flatMap(pattern => [...text.matchAll(pattern)].map(match => [match.index, match.index + match[0].length]))
  spans.sort((a, b) => a[0] - b[0] || b[1] - a[1])
  const merged = []
  for (const span of spans) {
    const last = merged.at(-1)
    if (last && span[0] < last[1])
      last[1] = Math.max(last[1], span[1])
    else
      merged.push([...span])
  }
  return merged
}

/** Splits free text with the first separator that works, recursively, so each piece fits. */
function splitFree(text, size, separators = SEPARATORS) {
  if (text.length <= size)
    return text ? [text] : []
  const [separator, ...rest] = separators
  if (separator === undefined) {
    const pieces = []
    for (let index = 0; index < text.length; index += size)
      pieces.push(text.slice(index, index + size))
    return pieces
  }
  const parts = text.split(separator)
  if (parts.length === 1)
    return splitFree(text, size, rest)
  return parts.flatMap((part, index) => splitFree(index < parts.length - 1 ? part + separator : part, size, rest))
}

/**
 * Cuts one section into units: protected spans and table rows stay whole, free text is split.
 * Each unit is `{ text, tableHeader? }`. A table row unit remembers its header rows.
 */
function toUnits(text, size) {
  const units = []
  const lines = text.split('\n')
  let buffer = ''
  let tableHeader
  const flush = () => {
    if (!buffer)
      return
    const spans = protectedSpans(buffer)
    let cursor = 0
    for (const [start, end] of spans) {
      units.push(...splitFree(buffer.slice(cursor, start), size).map(piece => ({ text: piece })))
      units.push({ text: buffer.slice(start, end) })
      cursor = end
    }
    units.push(...splitFree(buffer.slice(cursor), size).map(piece => ({ text: piece })))
    buffer = ''
  }
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]
    if (TABLE_ROW.test(line)) {
      flush()
      if (TABLE_SEPARATOR.test(lines[index + 1] ?? '')) {
        tableHeader = `${line}\n${lines[index + 1]}\n`
        units.push({ text: tableHeader })
        index++
      }
      else {
        units.push({ text: `${line}\n`, tableHeader })
      }
      continue
    }
    tableHeader = undefined
    buffer += `${line}\n`
  }
  flush()
  return units.filter(unit => unit.text.trim())
}

/** Packs units into chunks of at most `size` characters with about `overlap` characters carried over. */
function packUnits(units, size, overlap) {
  const chunks = []
  let current = []
  let length = 0
  for (const unit of units) {
    if (length + unit.text.length > size && current.length > 0) {
      chunks.push(current)
      const carried = []
      let carriedLength = 0
      for (let index = current.length - 1; index >= 0 && carriedLength + current[index].text.length <= overlap; index--) {
        carried.unshift(current[index])
        carriedLength += current[index].text.length
      }
      current = carried
      length = carriedLength
      // A table row that starts a chunk gets its header again, so the columns stay readable.
      if (unit.tableHeader && !current.some(item => item.text === unit.tableHeader)) {
        current.unshift({ text: unit.tableHeader })
        length += unit.tableHeader.length
      }
    }
    current.push(unit)
    length += unit.text.length
  }
  if (current.length > 0)
    chunks.push(current)
  return chunks.map(items => items.map(item => item.text).join('').trim()).filter(Boolean)
}

/**
 * Splits document text into chunks. Returns `[{ content, header }]`, where `header` is the
 * heading breadcrumb ("A > B") that WeKnora keeps outside the content (ContextHeader).
 */
export function chunkText(text, { size = DEFAULT_CHUNK_SIZE, overlap = DEFAULT_CHUNK_OVERLAP } = {}) {
  const sections = []
  const trail = []
  let body = []
  let inFence = false
  const pushSection = () => {
    if (body.join('').trim())
      sections.push({ header: trail.filter(Boolean).join(' > '), text: body.join('\n') })
    body = []
  }
  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith('```'))
      inFence = !inFence
    const heading = !inFence && HEADING.exec(line)
    if (heading) {
      pushSection()
      trail.length = heading[1].length - 1
      trail.push(heading[2].trim())
      continue
    }
    body.push(line)
  }
  pushSection()
  return sections.flatMap(section => packUnits(toUnits(section.text, size), size, overlap).map(content => ({ content, header: section.header })))
}

/**
 * Splits source code at blank lines into blocks of at most ~1500 characters.
 * The header is the file path with the line range, for example "src/app.ts:10-42".
 */
export function chunkCode(text, path, { maxChars = MAX_CODE_CHUNK_CHARS } = {}) {
  const lines = text.split(/\r?\n/)
  const chunks = []
  let start = 0
  let block = []
  let length = 0
  const push = (end) => {
    const content = block.join('\n').trim()
    if (content)
      chunks.push({ content, header: `${path}:${start + 1}-${end}` })
    block = []
    length = 0
  }
  lines.forEach((line, index) => {
    // A long block ends at the next blank line. A huge block without blank lines ends at the limit.
    if ((length > maxChars / 2 && line.trim() === '') || length + line.length > maxChars) {
      push(index)
      start = index
    }
    block.push(line)
    length += line.length + 1
  })
  push(lines.length)
  return chunks
}
