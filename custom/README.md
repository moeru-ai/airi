# custom — các tuỳ biến riêng của fork HoangIT-69/airi

Thư mục này chứa phần custom nằm ngoài code lõi, để kéo bản mới từ upstream không bị conflict.

## Card "Thư Ký" (Mai)

Persona thư ký kiêm trợ lý code bằng tiếng Việt. Mặc định dùng VRM `AvatarSample_A` (`preset-vrm-1`). Provider/model để trống, nên card dùng cấu hình chung trong Settings.

Nguồn: `cards/thu-ky/card.json` (Character Card v3) và `cards/thu-ky/manifest.json`.

Đóng gói (PowerShell, chạy trong thư mục `custom/`):

```powershell
Compress-Archive -Path cards/thu-ky/manifest.json,cards/thu-ky/card.json -DestinationPath dist/thu-ky.airi-card.zip -Force
```

Import: Settings → Character card (AIRI Card) → Import → chọn `dist/thu-ky.airi-card.zip` → kích hoạt card.

## Claude Code → Mai (`claude-code-hook/notify-airi.mjs`)

Hook của Claude Code. Mai báo khi Claude Code làm xong một lượt dài (`Stop`, mặc định ≥ 60 giây) hoặc cần bạn duyệt (`Notification`).

- Gửi `input:text` tới channel server của AIRI (`ws://localhost:6121/ws`). Token đọc từ `%APPDATA%/@proj-airi/stage-tamagotchi/server-channel-config.json`.
- Luôn thoát mã 0. Khi AIRI đang tắt, hook không làm gì.
- Cần `pnpm install` trong repo này, vì hook dùng `packages/server-sdk/dist`.
- Biến môi trường tùy chọn: `AIRI_NOTIFY_MIN_SECONDS`, `AIRI_CHANNEL_URL`, `AIRI_CHANNEL_TOKEN`, `AIRI_NOTIFY_DEBUG=1`.

Đăng ký trong `~/.claude/settings.json`:

```json
{
  "hooks": {
    "Stop": [{ "hooks": [{ "type": "command", "command": "node \"D:/workspace-AI-v2/projects/airi/custom/claude-code-hook/notify-airi.mjs\"", "timeout": 10 }] }],
    "Notification": [{ "hooks": [{ "type": "command", "command": "node \"D:/workspace-AI-v2/projects/airi/custom/claude-code-hook/notify-airi.mjs\"", "timeout": 10 }] }]
  }
}
```

## MCP chỉ đọc (`mcp-workspace-reader/server.mjs`)

MCP server stdio, không có dependency. Tool: `list_projects`, `list_dir`, `read_file`, `find_files`, `git_status`, `git_log`, `git_diff`.

- **Không có tool ghi.** AIRI chạy tool MCP mà không hỏi lại, nên server này phải giữ chỉ đọc.
- Chặn `.env*` (trừ `.env.example`), `*.local.md`, `account-info.md`, `.claude/local`, `settings.local.json`, khóa (`*.pem`, `*.key`), `.git`, `node_modules`, `.next`, `.open-next`. Chặn cả đường dẫn thoát khỏi `WORKSPACE_ROOT`.
- Giới hạn: file 200 KB, output 50 000 ký tự.
- Luật chặn dùng chung ở `shared/path-guard.mjs`. Logic MCP dùng chung (`handleMcpMessage`, vòng lặp stdio) ở `shared/mcp-stdio.mjs`. Định nghĩa tool nằm trong `tools.mjs` của từng server.

Đăng ký trong `%APPDATA%/@proj-airi/stage-tamagotchi/mcp.json`, hoặc Settings → Modules → MCP:

```json
{
  "mcpServers": {
    "workspace-reader": {
      "command": "node",
      "args": ["D:/workspace-AI-v2/projects/airi/custom/mcp-workspace-reader/server.mjs"],
      "env": { "WORKSPACE_ROOT": "D:/workspace-AI-v2/projects" },
      "enabled": true
    }
  }
}
```

## Kho tri thức + Wiki (`knowledge/`)

MCP server stdio, chạy ngay trong AIRI, không cần Docker. Thiết kế và prompt port từ [Tencent/WeKnora](https://github.com/Tencent/WeKnora) v0.8.2 (MIT). Ghi chú nguồn `file:line` nằm trong từng module.

| Module | Việc |
|---|---|
| `extract.mjs` | PDF (`unpdf`), DOCX (bảng → Markdown), PPTX, XLSX, HTML, MD, ảnh. Lấy ảnh nhúng cho vision |
| `chunk.mjs` | 512 ký tự, overlap 80. Không cắt bảng, code fence, link. Lặp lại tiêu đề bảng khi bảng bị tách. Breadcrumb heading. Mã nguồn chia theo khối, header `path:dòng` |
| `db.mjs` | `node:sqlite` + FTS5 (`remove_diacritics 2`: gõ không dấu vẫn tìm ra) |
| `embed.mjs` | Voyage, `input_type` document/query. `voyage-3.5` cho tài liệu, `voyage-code-3` cho code |
| `search.mjs` | Hybrid: vector + BM25, RRF trọng số 0.7/0.3, MMR λ=0.7 |
| `llm.mjs`, `vision.mjs`, `profile.mjs` | Claude qua `@anthropic-ai/sdk`. OCR + caption ảnh, hồ sơ tài liệu (summary, gist, topics, loại) |
| `ingest.mjs` | Quét folder (chặn file bí mật), diff SHA-256, job nền. Code lấy từ `git ls-files` |
| `wiki*.mjs` | Map (Haiku: thực thể/khái niệm + trang tóm tắt) → dedup → reduce (Sonnet: gộp trang kiểu "compiler") → index + linkify + dọn link chết. Folder có code thì thêm trang `overview/architecture` |

Tool:
- **Folder:** `add_folder(path, includeCode)`, `sync_folders`, `list_folders`, `remove_folder`, `index_status`.
- **Tìm và đọc:** `search_knowledge`, `read_document`, `list_documents`.
- **Wiki:** `wiki_build(folder, confirm)`, `wiki_search`, `wiki_read_page` (`index` = mục lục), `wiki_write_page`, `wiki_replace_text`.
  - `wiki_build` không có `confirm` thì chỉ trả về ước tính chi phí khi ước tính trên 1 USD.

Lưu trữ:
- Index: `%APPDATA%/airi-custom/knowledge.db`.
- Wiki: file Markdown trong `WIKI_DIR`, mỗi folder một thư mục con, link `[[slug|tên]]` (mở được bằng Obsidian).

Thiếu key thì server vẫn chạy:
- Không có `VOYAGE_API_KEY`: chỉ tìm theo từ khoá.
- Không có `ANTHROPIC_API_KEY`: không có vision, hồ sơ tài liệu và wiki.

Test: `pnpm test` trong `custom/` (`node --test`, không tốn credit, Claude và Voyage được giả lập).

## Viết docs (`mcp-docs-writer/`)

- Tool: `write_doc(title, content, sources)` và `list_docs`. Chỉ tạo file `YYYY-MM-DD-<slug>.md` mới trong `DOCS_DIR`.
- Không ghi đè: trùng tên thì thêm `-2`. Slug chỉ gồm `a-z0-9-`.

## Cấu hình `mcp.json` của AIRI

`%APPDATA%/@proj-airi/stage-tamagotchi/mcp.json`. Key do bạn tự dán, file này nằm ngoài repo. Chạy `pnpm install --ignore-workspace` trong `custom/` một lần để cài `unpdf`, `jszip`, `@anthropic-ai/sdk`.

```json
{
  "mcpServers": {
    "knowledge": {
      "command": "node",
      "args": ["D:/workspace-AI-v2/projects/airi/custom/knowledge/server.mjs"],
      "env": {
        "ALLOWED_ROOTS": "D:/workspace-AI-v2/projects;D:/workspace-AI-v2/docs",
        "WIKI_DIR": "D:/workspace-AI-v2/projects/_mai-wiki",
        "VOYAGE_API_KEY": "<voyage key>",
        "ANTHROPIC_API_KEY": "<claude key>"
      }
    },
    "docs-writer": {
      "command": "node",
      "args": ["D:/workspace-AI-v2/projects/airi/custom/mcp-docs-writer/server.mjs"],
      "env": { "DOCS_DIR": "D:/workspace-AI-v2/projects/_mai-docs" }
    }
  }
}
```

Model mặc định: `claude-haiku-5-5` cho vision, hồ sơ tài liệu và map wiki. `claude-sonnet-5-5` cho reduce và index wiki. Đổi bằng `VISION_MODEL`, `PROFILE_MODEL`, `WIKI_MAP_MODEL`, `WIKI_REDUCE_MODEL`, `EMBED_MODEL`, `EMBED_CODE_MODEL`.

## Đổi model VRM

- Toàn app: Settings → Models → chọn model, hoặc import file `.vrm` của bạn.
- Theo từng card: mở card → Edit → mục display model.
