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

## Đổi model VRM

- Toàn app: Settings → Models → chọn model, hoặc import file `.vrm` của bạn.
- Theo từng card: mở card → Edit → mục display model.
