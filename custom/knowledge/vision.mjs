// Image understanding with Claude: OCR plus a short caption in one call.
// Prompts follow WeKnora internal/application/service/image_multimodal.go:28-58, translated to Vietnamese.

const VISION_SYSTEM = [
  'Bạn đọc ảnh nằm trong tài liệu để phục vụ tìm kiếm.',
  'ocr_text: chép lại toàn bộ chữ trong ảnh theo đúng thứ tự đọc, dạng Markdown. Bảng viết thành bảng Markdown, công thức viết bằng LaTeX. Không thêm nhận xét. Ảnh không có chữ thì để chuỗi rỗng.',
  'caption: một hoặc hai câu tiếng Việt mô tả nội dung chính của ảnh (sơ đồ gì, biểu đồ gì, ảnh chụp gì).',
].join('\n')

const VISION_SCHEMA = {
  type: 'object',
  properties: {
    caption: { type: 'string' },
    ocr_text: { type: 'string' },
  },
  required: ['caption', 'ocr_text'],
  additionalProperties: false,
}

const VISION_MAX_TOKENS = 4000

/** Returns `{ caption, ocrText, usage }` for one image `{ name, mediaType, data }`. */
export async function describeImage(llm, model, image) {
  const { json, usage } = await llm({
    model,
    system: VISION_SYSTEM,
    schema: VISION_SCHEMA,
    maxTokens: VISION_MAX_TOKENS,
    content: [
      { type: 'image', source: { type: 'base64', media_type: image.mediaType, data: image.data.toString('base64') } },
      { type: 'text', text: `Ảnh: ${image.name}` },
    ],
  })
  return { caption: json.caption.trim(), ocrText: json.ocr_text.trim(), usage }
}

/** Turns a description into chunks: the caption, plus the OCR text when there is any. */
export function imageChunks(imageName, { caption, ocrText }) {
  const chunks = [{ type: 'image_caption', header: `Ảnh: ${imageName}`, content: caption }]
  if (ocrText)
    chunks.push({ type: 'image_ocr', header: `Chữ trong ảnh: ${imageName}`, content: ocrText })
  return chunks.filter(chunk => chunk.content)
}
