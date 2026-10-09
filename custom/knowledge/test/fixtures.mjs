// Builds small sample documents in a temporary folder for the knowledge tests.

import { Buffer } from 'node:buffer'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import JSZip from 'jszip'

// A valid 1x1 PNG.
export const PNG_BYTES = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64')

function minimalPdf(text) {
  const stream = `BT /F1 18 Tf 20 100 Td (${text}) Tj ET`
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ]
  let pdf = '%PDF-1.4\n'
  const offsets = []
  objects.forEach((object, index) => {
    offsets.push(pdf.length)
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`
  })
  const xref = pdf.length
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}`
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return pdf
}

/** Writes the fixtures and returns their folder. */
export async function createFixtures() {
  const dir = await mkdtemp(join(tmpdir(), 'knowledge-test-'))

  const docx = new JSZip()
  docx.file('word/document.xml', [
    '<w:document><w:body>',
    '<w:p><w:r><w:t>Báo cáo &amp; kế hoạch</w:t></w:r></w:p>',
    '<w:tbl><w:tr><w:tc><w:p><w:r><w:t>Hạng mục</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Số tiền</w:t></w:r></w:p></w:tc></w:tr>',
    '<w:tr><w:tc><w:p><w:r><w:t>Claude | API</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>100</w:t></w:r></w:p></w:tc></w:tr></w:tbl>',
    '<w:p><w:r><w:t>Kết thúc</w:t></w:r></w:p>',
    '</w:body></w:document>',
  ].join(''))
  docx.file('word/media/image1.png', PNG_BYTES)
  docx.file('word/media/image2.emf', Buffer.from('not raster'))
  await writeFile(join(dir, 'report.docx'), await docx.generateAsync({ type: 'nodebuffer' }))

  const pptx = new JSZip()
  pptx.file('ppt/slides/slide10.xml', '<p:sld><a:p><a:r><a:t>Slide mười</a:t></a:r></a:p></p:sld>')
  pptx.file('ppt/slides/slide2.xml', '<p:sld><a:p><a:r><a:t>Slide hai</a:t></a:r></a:p></p:sld>')
  pptx.file('ppt/media/image1.png', PNG_BYTES)
  await writeFile(join(dir, 'deck.pptx'), await pptx.generateAsync({ type: 'nodebuffer' }))

  const xlsx = new JSZip()
  xlsx.file('xl/workbook.xml', '<workbook><sheets><sheet name="Chi phí" sheetId="1" r:id="rId1"/></sheets></workbook>')
  xlsx.file('xl/_rels/workbook.xml.rels', '<Relationships><Relationship Id="rId1" Type="x" Target="worksheets/sheet1.xml"/></Relationships>')
  xlsx.file('xl/sharedStrings.xml', '<sst><si><t>Hạng mục</t></si><si><r><t>Claude</t></r><r><t> API</t></r></si></sst>')
  xlsx.file('xl/worksheets/sheet1.xml', '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c></row><row r="2"><c r="A2" t="s"><v>1</v></c><c r="B2"><v>100</v></c></row><row r="3"><c r="A3" t="inlineStr"><is><t>Voyage</t></is></c></row></sheetData></worksheet>')
  await writeFile(join(dir, 'cost.xlsx'), await xlsx.generateAsync({ type: 'nodebuffer' }))

  await writeFile(join(dir, 'hello.pdf'), minimalPdf('Hello PDF from AIRI test'))
  await writeFile(join(dir, 'diagram.png'), PNG_BYTES)
  await writeFile(join(dir, 'page.html'), '<html><body><h1>Tiêu đề</h1><script>alert(1)</script><p>Đoạn &amp; văn</p></body></html>')
  await writeFile(join(dir, 'notes.md'), '# Ghi chú\nNội dung markdown.')
  await writeFile(join(dir, 'archive.zip'), 'zip')
  return dir
}
