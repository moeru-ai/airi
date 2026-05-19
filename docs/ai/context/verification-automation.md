# Verification 自动化方案

设计稿，未实施。落到这里是为了让 verification 流程从「人工跑命令贴输出」走向「机器跑断言贴 evidence」，同时保留 AGENTS.md 里 Iron Law 的语义。

## TL;DR

1. **原因**：现有 5 份 verification 文档结构清晰，但执行步骤需要人工跑命令、人工贴输出、人工记录「最后验证」日期。一旦超过 30 天，AGENTS.md 规定默认 unverified，没有机制能识别这种过期。
2. **猜想**：verification 文档继续作为 single source of truth，每份文档关联一份可执行 artifact，artifact 跑通就是 evidence，跑通时间就是「最后验证」。
3. **决策**：分三层实施，集成测试覆盖 in-repo 可重现路径，live verifier 覆盖只能在已部署环境验证的路径，CI 守护过期时间。

## 背景

`apps/server/docs/ai-context/verifications/` 下 5 份文档，结构基本统一：

- `场景 / 用户路径`：写明用户敲 X，预期得到 Y
- `命令 / 步骤`：手工敲的 curl、SQL、UI 操作
- `预期 / 实际输出`：贴 response body、log 节选、screenshot 路径
- `Evidence`：commit SHA、行号引用、测试文件路径
- `Status` 与 `最后验证`：人工维护

其中 3 份文档（`flux-unbilled-exploit-fix`、`flux-unbilled-reconciliation`、`admin-flux-grants`）引用了已落库的 vitest 单测，剩下 2 份（`email-auth`、`account-deletion`）以手工 curl + 真实 Resend / 真实数据库为主。

## 拆解现状

把 5 份文档里的步骤按「证据来源」拆开，能看到三类：

1. **纯代码路径**，例如 partial-debit 的数值逻辑、ledger 行写入。这类已经被 vitest 单测覆盖，证据来源是 `expect()` 断言。
2. **跨外部边界的用户路径**，例如「N 个并发 LLM completion 触发 pre-flight 拒绝 + ledger 写入 + metric 上报」。这类需要 pg、redis、Hono app、Prometheus `/metrics` 端点同时在场，目前没有自动化覆盖。
3. **依赖部署环境的路径**，例如 Resend 真实投递、Stripe webhook 回调、Grafana panel 斜率、Better Auth 跨域 OIDC handoff。这类无论在 PR CI 还是本地都无法完整跑通，必须在 staging 或 prod 上验证。

第 1 类已经自动化，第 2、3 类是空缺。

## 提出猜想

verification 文档的「用户路径」描述天然适合作为测试用例标题。如果给每份文档加一份配套 artifact，artifact 类型按上面三类分发：

- 纯代码路径，归到 `*.test.ts`，已经这样做
- 跨边界的用户路径，归到 `*.integration.test.ts`，testcontainers 起依赖
- 依赖部署环境的路径，归到 `*.verifier.ts`，针对 staging URL 跑，post-deploy 触发

每份文档头部加一段 frontmatter，机器读取后能回答三个问题：

1. 这份文档对应的 feature 是什么
2. 自动化 artifact 在哪里
3. 上次自动化跑通是什么时候

## 分节解答

### 一、frontmatter schema

```yaml
---
feature: flux-unbilled-exploit-fix
owner: rbxin2003@gmail.com
automated_by:
  - kind: unit
    path: apps/server/src/services/billing/tests/billing-service.test.ts
    cases:
      - 'rejects pre-flight when balance is below FLUX_PER_REQUEST'
      - 'non-streaming completion drains partial balance and logs charged'
  - kind: integration
    path: apps/server/tests/verifications/flux-unbilled.integration.test.ts
  - kind: live
    path: apps/server/tests/verifications/flux-unbilled.verifier.ts
    schedule: post-deploy
last_verified:
  unit: 2026-05-15
  integration: 2026-05-15
  live: 2026-05-14
expires_after_days: 30
---
```

字段语义钉死：

- `feature`：文档 slug，与文件名同名
- `automated_by[].kind`：`unit` / `integration` / `live`，三选一
- `automated_by[].path`：可执行文件路径，CI 跑通后能写回 `last_verified`
- `last_verified.<kind>`：YYYY-MM-DD，由 CI 自动写回，人不手动改
- `expires_after_days`：默认 30，与 AGENTS.md 一致

### 二、集成测试 harness

放在每个 app 下的 `tests/verifications/` 目录，例如 `apps/server/tests/verifications/`。harness 提供：

1. testcontainers 起 Postgres 16 + Redis 7，注入与 `.env.example` 同 schema 的环境变量
2. `createApp()` 直接 mount，不走真实端口，调用 `app.request(...)`
3. 三种断言入口：
   - HTTP 响应，按现有 `app.test.ts` 范式
   - DB 状态，通过 drizzle 查 `flux_transaction` / `user_flux`
   - Metric 状态，scrape `/metrics` 文本，匹配 `airi_billing_flux_unbilled_total{...} <value>`

最小测试骨架：

```ts
describe('verification: flux-unbilled-exploit-fix', () => {
  let ctx: VerificationContext

  beforeAll(async () => {
    ctx = await startVerificationContext()
  })

  afterAll(async () => {
    await ctx.stop()
  })

  it('concurrent partial-balance requests yield one partial debit and N-1 pre-flight 402', async () => {
    await ctx.seedUser({ id: 'u1', balance: 5 })
    await ctx.setConfig({ FLUX_PER_REQUEST: 100 })

    const responses = await Promise.all(
      Array.from({ length: 5 }, () => ctx.app.request('/api/v1/openai/...')),
    )

    expect(responses.filter(r => r.status === 402)).toHaveLength(5)
    const ledger = await ctx.db.query.fluxTransaction.findMany({ where: ... })
    expect(ledger).toHaveLength(0)

    const metrics = await ctx.scrapeMetrics()
    expect(metrics).toMatchMetric('airi_billing_flux_unbilled_total', {
      labels: { reason: 'partial_debit_drained' },
      delta: 0,
    })
  })
})
```

`MatchMetric` 与 `scrapeMetrics` 这两个 helper 放在 `packages/server-runtime` 或 `apps/server/src/testing/`，由集成测试和 live verifier 共用。

### 三、live verifier

针对 staging / prod。形态选 vitest 也可以，选独立 CLI 也可以，差别在「是否需要被 CI 用 `--include` pattern 隔离」。建议直接沿用 vitest，给文件后缀 `.verifier.ts`，配 `vitest.config.ts` 的 `include` / `exclude` 把它们与 unit / integration 隔离。

live verifier 的断言对象不再是「mount 的 Hono app」，是「真实 URL」：

```ts
describe('live verifier: flux-unbilled-exploit-fix', () => {
  it('panel-43 slope is below alert threshold over the last 5 minutes', async () => {
    const slope = await prometheusQuery(
      'increase(airi_billing_flux_unbilled_total[5m])',
      { url: process.env.PROM_URL! },
    )
    expect(slope).toBeLessThan(0.5)
  })
})
```

需要凭据的项目（Prometheus、Resend、Stripe）通过 env 注入，与 `secrets-management` 规则一致，不写进文件。

### 四、CI 编排

三条 GitHub Actions workflow：

1. **`verification-unit.yml`**：PR 触发，跑全部 `*.test.ts`。现状已有，作为 baseline。
2. **`verification-integration.yml`**：PR 触发，跑全部 `*.integration.test.ts`。预计单跑 60 至 180 秒（testcontainers 启动），用 matrix 拆分到多个 worker。仅在改动触及 `apps/server/**` 或 `packages/server-*/**` 时跑，其他改动 skip。
3. **`verification-live.yml`**：post-deploy 触发（Railway deploy hook → GitHub repository_dispatch），针对 staging URL 跑全部 `*.verifier.ts`。跑通后自动 PR 一份更新 `last_verified.live` 的提交，或者直接 commit 回 main（按团队偏好选）。

第 2 类必要的 secret：testcontainers 自身不需要 secret，只需要 docker daemon，GitHub Actions runner 默认带。第 3 类需要 `PROM_URL`、`PROM_TOKEN`、`STRIPE_TEST_KEY`、`RESEND_API_KEY` 等，放到 GitHub Actions secrets。

### 五、过期守护

新增 `scripts/verification-doctor.ts`，在 `verification-unit.yml` 末尾跑：

```ts
// 遍历所有 verification 文档
//   读 frontmatter.last_verified
//   与 frontmatter.expires_after_days 比较
//   超期 -> stderr 报告 + exit 1
```

CI 失败时输出形如：

```
✗ flux-unbilled-reconciliation: last_verified.integration = 2025-12-01 (expired 165 days)
✗ email-auth: last_verified.live = (none)
```

主分支跑过期检查也跑，跑失败不阻塞 main，只发到 Slack / Lark 通知频道，避免老文档过期把全员卡住。

## 回指前文

回到 TL;DR 的三条决策：

1. 「集成测试覆盖 in-repo 可重现路径」对应第二节，testcontainers + drizzle + metric scrape 是这一层的最小工具集。
2. 「live verifier 覆盖只能在已部署环境验证的路径」对应第三节，针对真实 URL 跑 Prometheus query、Stripe test mode、Resend dashboard API。
3. 「CI 守护过期时间」对应第五节，frontmatter 的 `last_verified` 由 CI 写回，doctor 脚本扫超期。

三层加起来，verification 文档从「人工 claim」变成「机器 claim + 人工 narrative」。

## 影响面

| 维度 | 影响 |
|---|---|
| 单测时间 | 不变 |
| PR CI 时间 | 新增 60 至 180 秒（取决于 testcontainers 并发 + matrix 拆分） |
| 本地开发 | 默认 `pnpm exec vitest run` 不跑 integration，要显式跑 `pnpm verify:integration` |
| docker 依赖 | 本地跑 integration 需要 docker daemon，已有 `docker-compose.otel.yml` 范式 |
| Secret 管理 | live verifier 需要 4 至 6 个 staging secret，放 GitHub Actions secrets |
| 文档维护 | verification 文档新增 frontmatter，原有 markdown 正文不变 |
| AGENTS.md | 加一段「如何写 verification artifact」，引用本文 |

## 可观测性 / eval

实施后用三个指标判断方案有效：

1. **集成测试覆盖率**：5 份文档里有几份对应有 `*.integration.test.ts`，目标 100%
2. **live verifier 触发频率**：post-deploy 一次必跑，跑失败的次数与生产 incident 的相关性
3. **doctor 报告超期数**：每周扫一次，超期数应当趋近 0

第 3 个指标如果长期不为 0，说明 verification 流程仍需要人工介入太多，要回头看 frontmatter 设计是否合适。

## 收束

这份方案保留 verification 文档的人工 narrative（root cause、why、tradeoff），把可执行部分挪到代码，把过期检测交给 CI。实施分三步：

1. 先做 frontmatter schema 与 doctor 脚本，零代码改动，立即能识别已有 5 份文档的过期状态。
2. 再做 `flux-unbilled-exploit-fix` 的集成测试样板，跑通一个 case 形成模板。
3. 最后逐份补齐 integration 与 live verifier。

如果某一份文档（例如 `email-auth`）的 live 验证依赖 Resend 真实投递，确认收件状态需要轮询 Resend `/emails` API，这部分实现成本较高，可以推到第三步的尾巴上单独立项。
