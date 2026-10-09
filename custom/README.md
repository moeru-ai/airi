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
- Luật chặn dùng chung ở `shared/path-guard.mjs`. Vòng lặp MCP stdio dùng chung ở `shared/mcp-stdio.mjs`.

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

## Kho tri thức WeKnora

[Tencent/WeKnora](https://github.com/Tencent/WeKnora) chạy bằng Docker trong `D:/workspace-AI-v2/projects/WeKnora` (v0.8.2). Web UI: http://localhost. API: http://localhost:8080. `.env` bind cổng vào `127.0.0.1`.
Mai điều phối. WeKnora chỉ lưu, index và tìm tài liệu. Embedding dùng Voyage AI, cấu hình trong web UI của WeKnora.

Ba server MCP liên quan:

| Server | Loại | Việc |
|---|---|---|
| `weknora` | HTTP, có sẵn trong WeKnora | Tìm và đọc tài liệu (`search_knowledge`, `read_document`, …) |
| `weknora-folders` | stdio, `weknora-folders/server.mjs` | `add_folder`, `sync_folders`, `list_folders`, `remove_folder` |
| `docs-writer` | stdio, `mcp-docs-writer/server.mjs` | `write_doc`, `list_docs` |

### `weknora-folders`

- Chỉ nhận thư mục trong `ALLOWED_ROOTS` (cách nhau bởi `;`). Bỏ qua file bí mật (luật của `path-guard`), code, file > 30 MB.
- Đuôi được nạp: pdf, doc/x, ppt/x, xls/x, md, txt, csv, json, html, epub. Đường dẫn giữ nguyên dạng `<tên folder>/<đường dẫn con>` trong KB.
- Sync theo hash SHA-256: file mới thì upload. File đổi thì xoá bản cũ rồi upload lại. File bị xoá thì xoá knowledge. Chỉ xoá tài liệu do tool này tạo.
- State: `%APPDATA%/airi-custom/weknora-folders.json`. Có lock file để MCP và CLI không chạy cùng lúc.
- Mỗi lần gọi MCP upload tối đa 100 file. CLI `node weknora-folders/sync.mjs` không giới hạn. CLI đọc env từ mục `weknora-folders` trong `mcp.json` của AIRI.
- Tự đồng bộ: Task Scheduler chạy CLI định kỳ.

### `docs-writer`

- Tạo file `YYYY-MM-DD-<slug>.md` mới trong `DOCS_DIR` (mặc định `D:/workspace-AI-v2/projects/_mai-docs`), có front-matter (title, created, sources).
- Không bao giờ ghi đè: trùng tên thì thêm `-2`, `-3`. Slug chỉ gồm `a-z0-9-`, nên tiêu đề không thể thoát khỏi thư mục.

### Cấu hình `mcp.json`

```json
{
  "mcpServers": {
    "weknora": {
      "url": "http://127.0.0.1:8080/mcp/<endpoint_id>",
      "headers": { "Authorization": "Bearer <mcp token>" }
    },
    "weknora-folders": {
      "command": "node",
      "args": ["D:/workspace-AI-v2/projects/airi/custom/weknora-folders/server.mjs"],
      "env": {
        "WEKNORA_BASE_URL": "http://127.0.0.1:8080/api/v1",
        "WEKNORA_API_KEY": "<api key>",
        "WEKNORA_DEFAULT_KB": "<kb id>",
        "ALLOWED_ROOTS": "D:/workspace-AI-v2/projects;D:/workspace-AI-v2/docs"
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

Không commit key. `mcp.json` nằm trong `%APPDATA%`, ngoài repo.

## Đổi model VRM

- Toàn app: Settings → Models → chọn model, hoặc import file `.vrm` của bạn.
- Theo từng card: mở card → Edit → mục display model.
