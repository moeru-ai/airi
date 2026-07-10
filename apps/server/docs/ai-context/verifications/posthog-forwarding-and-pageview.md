# Verification: 服务端 PostHog 转发 + SPA 路由 pageview

Status: **transport 与 pageview 已真实验证；线上 Stripe webhook 端到端待部署后确认**
Owner: Product Analytics
Last updated: 2026-07-08
Environment: commit 689f02ac4 + 本次工作区改动；posthog-node 5.39.4；posthog-js 1.306.1；Node 26.3.0

## 用户路径

- **场景 1**：用户完成 Stripe 支付 → webhook 写 `product_events` → 服务端把 `payment_completed` 转发到 PostHog（distinctId = Better Auth user id）→ PostHog 付费漏斗在 `checkout_started` 后闭环。
- **场景 2**：用户在 stage-web 内切换路由（如进入 `/settings/flux`）→ PostHog 收到 `$pageview`，带 `$pathname`、上一页路径与停留时长。

## 已验证证据

| 验证项 | 命令 / 方式 | 实际输出 |
|---|---|---|
| 转发白名单与映射 | `pnpm exec vitest run src/services/domain/product-events.test.ts`（apps/server） | 6 passed：`payment_completed` 原名转发、`user_signed_up→signup_completed` 映射、per-request 动作不转发、sink 抛错时 DB 行仍落库且 track 不抛 |
| posthog-node 真实传输 | `node posthog-smoke.mjs`（captureImmediate → us.i.posthog.com，生产 project key，事件名 `server_forwarding_smoke_test`） | `captureImmediate resolved in 1380ms` + `shutdown clean` |
| SPA 路由 pageview | `VITE_ENABLE_POSTHOG=true pnpm -F @proj-airi/stage-web dev` + agent-browser 两次 `history.pushState` | 两条 `$pageview`，`$pathname` 分别为 `/settings/flux`、`/settings/airi-card`，`navigation_type: pushState`，携带 `$prev_pageview_duration` 与 `surface: web` super property；批量 POST `us.i.posthog.com/e/` 返回 200 |
| 服务端 typecheck / lint | `pnpm -F @proj-airi/server typecheck`、eslint 改动文件 | 均通过 |

## 注意事项

- 自动化浏览器（`navigator.webdriver = true`）会被 posthog-js 默认 bot 过滤静默丢弃事件；本次浏览器验证通过会话内 `set_config({ opt_out_useragent_filter: true })` 绕过，仅影响该验证会话，生产配置未改。人工复测时用普通浏览器即可，无需任何绕过。
- 服务端转发默认开启：`POSTHOG_PROJECT_KEY` 的默认值就是前端共用的 phc_* project key，置空字符串可关闭。部署后在 PostHog 里确认 `payment_completed` 事件出现在真实支付后，即完成端到端收尾。
- PostHog 项目里会留有一条 `server_forwarding_smoke_test`（distinctId `verification-smoke`）测试事件，分析时按事件名过滤。
