# Verification: Flux Unbilled Historical Reconciliation

Status: **investigation framework — data gathering pending**
Owner: rbxin2003@gmail.com
Last updated: 2026-05-15
Related: [`flux-unbilled-exploit-fix.md`](./flux-unbilled-exploit-fix.md), [Grafana panel-43](../../../otel/grafana/dashboards/airi-server-overview-cloud.json)

## 用户路径

- **场景**：commit `7267b0d6b` 之前累积了 ~70.2K Flux 的 unpaid usage（panel-43 `airi_billing_flux_unbilled_total` 显示值）。需要决定核销、补账、还是不处理
- **预期**：跑下面的 SQL + Loki query → 区分 partial-drain（用户已部分付款）vs debit-failed（DB 错误，真零付款）→ 按 user 聚合 → 给出 reconciliation 决策
- **当前状态**：没有 prod DB 访问权限的工程师跑下面的 query。下方 SQL/queries 是**待执行的模板**，不是已采集的数据

## 两类漏账的区分

修补前 `airi_billing_flux_unbilled_total` 是单一 counter，没区分 reason。修补后（`7267b0d6b`）按 `reason` 拆成两个 label：

| reason label | 触发条件 | Ledger 是否有记录 | 用户实际付款比例 |
|---|---|---|---|
| `partial_debit_drained` | `0 < balance < amount`，drain 到 0 | ✓ 有（`amount = charged`，metadata 带 `unbilled`） | 部分付款（drain 数额） |
| `debit_failed` | `balance <= 0` 或 DB tx 抛错 | ✗ 无（tx 回滚） | 零付款 |

**70.2K 全部发生在 5/15 之前**，那时所有失败都走 catch path → 全部记为 `reason='debit_failed'`，**全部无 ledger row** → 用户实际付款为 0。

但实际不全是漏洞：少部分是真正的 DB 错误（DB outage / 唯一索引冲突）。绝大部分是 exploit。

## 取证 SQL（待执行）

> 在 Railway Postgres console 或本地 `psql $DATABASE_URL` 跑。如果 query 太重，先 `EXPLAIN ANALYZE` 看 cost；`flux_transaction` 有 `flux_tx_user_id_idx` 和 `flux_tx_created_at_idx` 索引可以走

### 1. 按 type 分类的 ledger 写入分布

`reason='debit_failed'` 没 ledger row，所以这条 query **拿不到**修补前的漏洞数据——它只能 sanity check 修补后的新 row：

```sql
SELECT
  type,
  COUNT(*)                AS row_count,
  SUM(amount)             AS total_amount,
  MIN(created_at)         AS first_seen,
  MAX(created_at)         AS last_seen
FROM flux_transaction
WHERE created_at >= '2026-04-15'    -- 4 周窗口
GROUP BY type
ORDER BY total_amount DESC;
```

### 2. Partial-drain ledger rows（修补后）

`commit 7267b0d6b` 之后才会有这种 row。修补前漏出去的 70K 在这里**看不到**：

```sql
SELECT
  user_id,
  COUNT(*)                                        AS partial_debit_count,
  SUM(amount)                                     AS total_charged,
  SUM((metadata->>'unbilled')::bigint)            AS total_unbilled,
  SUM((metadata->>'requestedAmount')::bigint)     AS total_requested,
  MIN(created_at)                                 AS first_partial,
  MAX(created_at)                                 AS last_partial
FROM flux_transaction
WHERE type = 'debit'
  AND metadata ? 'unbilled'
  AND (metadata->>'unbilled')::bigint > 0
  AND created_at >= '2026-05-15'  -- 修补后窗口
GROUP BY user_id
ORDER BY total_unbilled DESC
LIMIT 50;
```

### 3. 流量最高的用户（用来定位 exploit 嫌疑）

修补前的漏账主要靠这条 + Loki 日志交叉定位涉事 user：

```sql
SELECT
  user_id,
  COUNT(*)                                          AS debit_count,
  SUM(amount)                                       AS total_debited,
  SUM(balance_after - balance_before)               AS net_balance_change,
  MIN(created_at)                                   AS first_debit,
  MAX(created_at)                                   AS last_debit
FROM flux_transaction
WHERE type = 'debit'
  AND created_at BETWEEN '2026-05-01' AND '2026-05-15'  -- 修补前 2 周
GROUP BY user_id
HAVING COUNT(*) > 100
ORDER BY debit_count DESC
LIMIT 20;
```

异常用户特征：`debit_count` 极高 + `net_balance_change` 接近 0 即"balance 一直被推到底但没归零"。这种是 exploit 的核心 signature——攻击者维持 balance 卡在 `0 < x < fallbackRate` 区间反复触发免费请求。注意：`net_balance_change` 在 ledger 模型下应该等于 `-SUM(amount)`；如果两者接近 0 但 `SUM(amount)` 很大，说明 balance 被人工补回去过（信用 / 充值 / promo），需要进一步交叉检查。

### 4. 当前 user_flux 余额 vs ledger 一致性 sanity

```sql
WITH ledger_balance AS (
  SELECT
    user_id,
    SUM(CASE WHEN type = 'credit' OR type = 'initial' OR type = 'promo' THEN amount
             WHEN type = 'debit' THEN -amount
             ELSE 0
        END) AS computed_balance
  FROM flux_transaction
  GROUP BY user_id
)
SELECT
  uf.user_id,
  uf.flux              AS recorded_balance,
  lb.computed_balance  AS ledger_sum,
  uf.flux - lb.computed_balance AS drift
FROM user_flux uf
LEFT JOIN ledger_balance lb USING (user_id)
WHERE ABS(uf.flux - COALESCE(lb.computed_balance, 0)) > 0
ORDER BY ABS(uf.flux - COALESCE(lb.computed_balance, 0)) DESC
LIMIT 50;
```

正常情况下 drift 应该是 0——任何 drift 都说明 ledger 和 user_flux 表脱钩了，是 P0 事件。

## 取证 Loki（待执行）

Grafana → Explore → Loki datasource。这是**修补前漏账数据的唯一来源**（无 ledger row）：

### 漏账 error log 全量

```logql
{service_name="server"} |= "Failed to debit flux after streaming — unpaid usage"
| json
| line_format "{{.userId}} | req={{.requestId}} | flux={{.fluxConsumed}} | {{.error}}"
```

### 按 userId 聚合 unbilled 数量

```logql
sum by (userId) (
  count_over_time({service_name="server"} |= "Failed to debit flux after streaming" | json [30d])
)
```

### 时间分布（找爆发时段）

```logql
sum (
  rate({service_name="server"} |= "Failed to debit flux after streaming" | json [5m])
)
```

修补前若有 sustained > 0 → exploit；若是窄峰 → 真实 DB outage。

## 处理决策框架

跑完上面 query + Loki 后，按下面决策树走：

```
┌──────────────────────────────────────────┐
│ 单用户漏账 fluxConsumed > 1000?           │
├──────────────────────────────────────────┤
│  YES → exploit 嫌疑                       │
│    ├─ 多 IP / 短时间高频 → confirmed       │
│    │     │ 不补账（用户已知道是漏洞）        │
│    │     │ Ban user 或 require email     │
│    │     │   verification + 强制 reauth   │
│    │     │ 已修补 → 单纯历史损失            │
│    │     └─ 不需要在 Postgres 写新 ledger │
│    └─ 单 IP / 时间分散 → 可能正常 power user │
│           │ 主动联系用户，问明情况           │
│           └─ 视情况决定是否赠送 flux 补偿    │
│                                          │
│  NO (用户总漏账 < 1000 flux) → 真异常       │
│    │ 多半是 DB outage / 单次错误           │
│    │ 不值得逐个追账                         │
│    └─ 整体核销 + 跑 sanity SQL 4 验证      │
│         user_flux ≡ ledger 仍然一致        │
└──────────────────────────────────────────┘
```

**关键判断**：修补前的漏账**不在 ledger 里**（debit_failed 不写 row），所以**不需要在 DB 做任何"核销"操作**——余额是干净的，损失只是"曾经免费送出去的 LLM token 成本"。

唯一需要写 DB 操作的场景：sanity SQL #4 跑出非零 drift。那是另一个 bug（ledger ↔ user_flux 脱钩），跟漏账无关。

## 修补后的监控建议（持续）

1. 加 Grafana alert：`increase(airi_billing_flux_unbilled_total{reason!="partial_debit_drained"}[5m]) > 0` → 立即 page（partial drain 是合理路径，不 page）
2. 加每周自动 cron job 跑 sanity SQL #4，drift > 0 → 报警（注意：项目里**不允许**新加后台 worker / cron，所以这个 job 应该走外部 ops 工具，比如 Railway scheduled command 或 GitHub Action）

## What's verified / What's pending

| Item | Status |
|---|---|
| 漏洞已堵（commit `7267b0d6b`） | ✓ 已确认（见 `flux-unbilled-exploit-fix.md`） |
| 70.2K 历史漏账的 user 分布 | ⊘ 待跑 Loki query |
| user_flux ↔ ledger drift 是否存在 | ⊘ 待跑 SQL #4 |
| Exploit 涉事 user 是否已 ban / re-auth | ⊘ 等数据出来后决定 |
| `airi_billing_flux_unbilled_total{reason!="partial_debit_drained"}` Grafana alert | ⊘ 待配（见 `metrics-ownership.md` Alert SOP） |
