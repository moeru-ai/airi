// Document profile: a short summary, a one-line gist, topics, and a document type.
// Port of WeKnora config/prompt_templates/generate_summary.yaml (default_summary), in Vietnamese.

const PROFILE_INPUT_CHARS = 8192
const OMITTED = '\n[...lược bớt...]\n'
const PROFILE_MAX_TOKENS = 2000
const MIN_PROFILE_CHARS = 200

const PROFILE_SYSTEM = `Bạn là chuyên gia lập hồ sơ tài liệu. Mô tả tài liệu CHỈ dựa trên nội dung được cung cấp, không dựa vào tên file hay đuôi file.

Các trường:
- summary: 2-3 câu (khoảng 60-120 từ) nêu chủ đề, các ý chính và kết luận chính. Khách quan, ngôi thứ ba, không mở đầu rườm rà.
- gist: một dòng (tối đa 25 từ) nói tài liệu nói về gì.
- topics: 3-5 từ khoá ngắn (1-4 từ) mà người đọc sẽ dùng để tìm tài liệu này. Dùng thuật ngữ của chính tài liệu, không dùng từ chung chung như "thông tin", "tài liệu".
- doc_type: nhãn ngắn cho loại tài liệu, ví dụ "hướng dẫn sử dụng", "biên bản họp", "hợp đồng", "báo cáo", "đặc tả", "FAQ", "chính sách", "slide".

Quy tắc:
- Không thêm gì không có trong nội dung.
- Có dấu "[...lược bớt...]" nghĩa là đây là đoạn trích từ tài liệu dài hơn: bao quát các chủ đề xuất hiện ở mọi phần, không chỉ phần đầu.
- Tài liệu kỹ thuật: giữ thuật ngữ, số liệu, định danh. Biên bản họp, báo cáo: nêu quyết định, việc cần làm, kết luận.
- Văn bản trong <image_caption> hoặc <image_ocr> là nội dung lấy từ ảnh của tài liệu, coi như nội dung thật.
- Viết bằng tiếng Việt, giữ nguyên thuật ngữ kỹ thuật tiếng Anh.`

const PROFILE_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    gist: { type: 'string' },
    topics: { type: 'array', items: { type: 'string' } },
    doc_type: { type: 'string' },
  },
  required: ['summary', 'gist', 'topics', 'doc_type'],
  additionalProperties: false,
}

/** Samples the beginning, middle, and end of a long text, so the profile covers the whole document. */
export function sampleForProfile(text, limit = PROFILE_INPUT_CHARS) {
  if (text.length <= limit)
    return text
  const part = Math.floor((limit - OMITTED.length * 2) / 3)
  const middle = Math.floor(text.length / 2 - part / 2)
  return [text.slice(0, part), text.slice(middle, middle + part), text.slice(-part)].join(OMITTED)
}

/** Returns `{ summary, gist, topics, docType, usage }`, or undefined when the text is too short. */
export async function profileDocument(llm, model, { title, text }) {
  if (text.trim().length < MIN_PROFILE_CHARS)
    return undefined
  const { json, usage } = await llm({
    model,
    system: PROFILE_SYSTEM,
    schema: PROFILE_SCHEMA,
    maxTokens: PROFILE_MAX_TOKENS,
    content: `Tài liệu: ${title}\n\n${sampleForProfile(text)}`,
  })
  return { summary: json.summary.trim(), gist: json.gist.trim(), topics: json.topics.slice(0, 5), docType: json.doc_type.trim(), usage }
}

/** The summary chunk WeKnora embeds next to the content chunks (knowledge_process.go:815-878). */
export function summaryChunk(profile) {
  return { type: 'summary', header: 'Tóm tắt', content: `${profile.gist}\n\n${profile.summary}\n\nChủ đề: ${profile.topics.join(', ')}` }
}
