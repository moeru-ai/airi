/* eslint-disable test/no-import-node-test, no-restricted-syntax -- custom/ is outside the AIRI Vitest workspace and runs on node --test. Plain Node.js ESM needs file extensions. */
import assert from 'node:assert/strict'

import { describe, it } from 'node:test'

import { chunkCode, chunkText } from '../chunk.mjs'

describe('chunkText', () => {
  it('keeps short text as one chunk with its heading breadcrumb', () => {
    const chunks = chunkText('# Dự án\n## Kiến trúc\nAIRI dùng Electron.')
    assert.deepEqual(chunks, [{ content: 'AIRI dùng Electron.', header: 'Dự án > Kiến trúc' }])
  })

  it('resets deeper headings when a higher heading starts', () => {
    const chunks = chunkText('# A\n## B\nmột\n# C\nhai')
    assert.deepEqual(chunks.map(chunk => chunk.header), ['A > B', 'C'])
  })

  it('splits long text under the size limit and carries some overlap', () => {
    const paragraph = 'Câu văn mẫu dài vừa phải để kiểm tra việc cắt. '
    const chunks = chunkText(paragraph.repeat(40), { size: 200, overlap: 60 })
    assert.ok(chunks.length > 1)
    for (const chunk of chunks)
      assert.ok(chunk.content.length <= 200, `chunk too long: ${chunk.content.length}`)
    const tail = chunks[0].content.slice(-30)
    assert.ok(chunks[1].content.includes(tail.trim().slice(0, 20)), 'second chunk starts with overlap')
  })

  it('never splits a fenced code block', () => {
    const code = `\`\`\`ts\n${'const value = 1\n'.repeat(30)}\`\`\``
    const chunks = chunkText(`Trước\n\n${code}\n\nSau`, { size: 120, overlap: 0 })
    const withFence = chunks.filter(chunk => chunk.content.includes('```'))
    assert.equal(withFence.length, 1)
    assert.match(withFence[0].content, /^```ts[\s\S]*```$/)
  })

  it('repeats the table header when a table continues in the next chunk', () => {
    const rows = Array.from({ length: 12 }, (_, index) => `| hàng ${index} | giá trị ${index} |`).join('\n')
    const table = `| Cột A | Cột B |\n| --- | --- |\n${rows}`
    const chunks = chunkText(table, { size: 120, overlap: 0 })
    assert.ok(chunks.length > 1)
    for (const chunk of chunks)
      assert.match(chunk.content, /^\| Cột A \| Cột B \|\n\| --- \| --- \|/)
  })

  it('ignores headings inside code fences', () => {
    const chunks = chunkText('# Thật\n```\n# không phải heading\n```')
    assert.deepEqual(chunks.map(chunk => chunk.header), ['Thật'])
  })

  it('returns nothing for empty or blank input', () => {
    assert.deepEqual(chunkText(''), [])
    assert.deepEqual(chunkText('\n\n  \n'), [])
  })
})

describe('chunkCode', () => {
  it('splits at blank lines and labels each chunk with the line range', () => {
    const fn = name => `function ${name}() {\n${'  doWork()\n'.repeat(40)}}\n`
    const chunks = chunkCode([fn('a'), fn('b'), fn('c')].join('\n'), 'src/app.ts', { maxChars: 800 })
    assert.ok(chunks.length >= 2)
    assert.match(chunks[0].header, /^src\/app\.ts:1-\d+$/)
    for (const chunk of chunks)
      assert.ok(chunk.content.length <= 800)
  })

  it('cuts a block without blank lines at the size limit', () => {
    const chunks = chunkCode('x = 1\n'.repeat(500), 'a.py', { maxChars: 300 })
    assert.ok(chunks.length > 5)
  })
})
