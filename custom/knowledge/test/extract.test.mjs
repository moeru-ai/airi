/* eslint-disable test/no-import-node-test, no-restricted-syntax -- custom/ is outside the AIRI Vitest workspace and runs on node --test. Plain Node.js ESM needs file extensions. */
import assert from 'node:assert/strict'

import { rm } from 'node:fs/promises'
import { join } from 'node:path'
import { after, before, describe, it } from 'node:test'

import { extractDocument } from '../extract.mjs'
import { createFixtures, PNG_BYTES } from './fixtures.mjs'

describe('extractDocument', () => {
  let dir
  before(async () => {
    dir = await createFixtures()
  })
  after(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('turns DOCX tables into Markdown rows and decodes entities once', async () => {
    const { text } = await extractDocument(join(dir, 'report.docx'))
    assert.match(text, /^Báo cáo & kế hoạch$/m)
    assert.match(text, /^\| Hạng mục \| Số tiền \|$/m)
    assert.match(text, /^\| --- \| --- \|$/m)
    assert.match(text, /^\| Claude \\\| API \| 100 \|$/m)
    assert.match(text, /^Kết thúc$/m)
  })

  it('returns raster images only when asked, and skips vector formats', async () => {
    const plain = await extractDocument(join(dir, 'report.docx'))
    assert.equal(plain.images, undefined)
    const { images } = await extractDocument(join(dir, 'report.docx'), { withImages: true })
    assert.deepEqual(images.map(image => [image.name, image.mediaType]), [['image1.png', 'image/png']])
    assert.ok(images[0].data.equals(PNG_BYTES))
  })

  it('orders PPTX slides by number, not by name', async () => {
    const { text, units, images } = await extractDocument(join(dir, 'deck.pptx'), { withImages: true })
    assert.equal(units, '2 slide')
    assert.ok(text.indexOf('Slide hai') < text.indexOf('Slide mười'))
    assert.equal(images.length, 1)
  })

  it('reads XLSX shared, rich, inline, and numeric cells', async () => {
    const { text } = await extractDocument(join(dir, 'cost.xlsx'))
    assert.match(text, /## Sheet: Chi phí/)
    assert.match(text, /Claude API\t100/)
    assert.match(text, /Voyage/)
  })

  it('reads PDF text by page', async () => {
    const { text, units } = await extractDocument(join(dir, 'hello.pdf'))
    assert.equal(units, '1 trang')
    assert.match(text, /--- Trang 1 ---\nHello PDF from AIRI test/)
  })

  it('treats a standalone image as an image with no text', async () => {
    const { text, images } = await extractDocument(join(dir, 'diagram.png'), { withImages: true })
    assert.equal(text, '')
    assert.equal(images[0].mediaType, 'image/png')
  })

  it('strips scripts and tags from HTML', async () => {
    const { text } = await extractDocument(join(dir, 'page.html'))
    assert.doesNotMatch(text, /alert/)
    assert.match(text, /Đoạn & văn/)
  })

  it('rejects unsupported formats and missing files', async () => {
    await assert.rejects(extractDocument(join(dir, 'archive.zip')), /Chưa hỗ trợ định dạng \.zip/)
    await assert.rejects(extractDocument(join(dir, 'missing.md')), { code: 'ENOENT' })
  })
})
