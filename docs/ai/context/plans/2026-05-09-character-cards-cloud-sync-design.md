# Character Cards Cloud Sync — Phase 1 Design

> Date: 2026-05-09
> Status: Design (pending approval)
> Owner: @RainbowBird
> Track: Phase 1 of A (大整合 — 三 store 合一 + 云同步)

## 1. Goal & Non-Goals

### Goal

让所有 stage 入口（stage-tamagotchi / stage-web / stage-pocket）的角色卡数据从纯本地 `localStorage` 升级为「**本地永远是 source of truth on device + 登录后云同步**」，并清理「三 store 并存」技术债的第一刀（废 `stores/characters.ts` 孤岛页）。

### Non-Goals（本 Phase 不做）

- **Phase 2**：删 [`stores/character/index.ts`](../../../packages/stage-ui/src/stores/character/index.ts) facade，统一 character 调用入口
- **Phase 3**：rename `useAiriCardStore` → `useCharacterStore`，命名对齐 server
- Settings 云同步（独立 spec，等本 spec 的 sync engine 落地后再接）
- Marketplace 上架路径（`user_characters` → `characters` 的 explicit publish transform）
- 多设备并发实时编辑（per-field LWW / vector clock / 冲突 UI — α-full 范围）
- Server-push（SSE / WS）同步推送 — 本 Phase 是被动 pull on focus / login

## 2. 现状

3 个并行 store 在管「角色卡」概念：

| # | Store | 数据形态 | 存储 | 用户路径 |
|---|-------|---------|------|---------|
| 1 | `useAiriCardStore` ([`stores/modules/airi-card.ts`](../../../packages/stage-ui/src/stores/modules/airi-card.ts)) | CCv3 jsonb + airi extension | `useLocalStorageManualReset<Map<string,AiriCard>>('airi-cards')` | **事实上的运行时角色卡** — 三端 App.vue / chat / Stage / profile-switcher / artistry / sessions-drawer，调用点 25+ |
| 2 | `useCharacterStore` ([`stores/characters.ts`](../../../packages/stage-ui/src/stores/characters.ts)) | 关系化 (character + i18n + capabilities + avatar + cover) | server `/characters` API + `@pinia/colada` | **孤岛**：仅 [`apps/stage-web/src/pages/settings/characters/`](../../../apps/stage-web/src/pages/settings/characters/) |
| 3 | `useCharacterStore` ([`stores/character/index.ts`](../../../packages/stage-ui/src/stores/character/index.ts)) ← 同名！| facade of #1 | — | [v2/index.vue](../../../packages/stage-pages/src/pages/v2/index.vue) / devtools/context-flow |

Server `characters` 表（[`apps/server/src/schemas/characters.ts`](../../../apps/server/src/schemas/characters.ts)）已经是 marketplace 形态（`likesCount` / `forksCount` / `priceCredit` / `character_i18n` 多语言 / `character_capabilities` / `avatar_model` / `character_covers`），跟 client AiriCard CCv3 schema 完全不同。

## 3. 终态（Phase 1 完成后）

- `useAiriCardStore` 内部存储从 `localStorage`-only 升级到「**localStorage 主路径 + sync engine 后台同步到 server**」
- 25+ 调用面 path（`activeCard.x.y.z`）**完全不变**——只换内部存储和加 sync 层
- 现有 `stores/characters.ts` 孤岛被废：删 store/service/model 文件，[`apps/stage-web/src/pages/settings/characters/`](../../../apps/stage-web/src/pages/settings/characters/) 改用统一的 [`packages/stage-pages/src/pages/settings/airi-card/`](../../../packages/stage-pages/src/pages/settings/airi-card/) 页（stage-tamagotchi 已经在用）
- Server 新建 `user_characters` + `user_active_character` 表
- Server 现有 `/characters` 路由和 `characters` 表**保留不动**（marketplace 用，未来 spec 接入）

## 4. 关键设计决策

| # | 决策 | 选择 | 拒绝理由 |
|---|------|------|---------|
| D1 | 范围 | A 拆 3 Phase，本次只做 Phase 1 | 不拆 = PR 太大风险高；只做 B（不合 store）= 留二次重构债 |
| D2 | 未登录态 | **α-min**：本地可写 + 登录后 union by clientId 上传 | β（强制登录）破坏离线 UX、炸老用户；γ（不 merge）默默丢卡 |
| D3 | `activeCardId` 同步粒度 | per-user | per-device 违反「养一个 AI 角色」产品直觉 |
| D4 | server schema | 两张表（`user_characters` + 现存 `characters`） | 单表 + visibility 字段：marketplace/private 权限边界易漏；多语言关系字段对私有卡冗余 |
| D5 | Delete 语义 | soft delete（`deletedAt` tombstone）参与 LWW | hard delete = 多设备 race 复活已删卡 |
| D6 | 同步触发 | `watchDebounced` 自动后台 sync (2s) + retry 队列 | 手动按钮 = 用户感知不一致状态 |
| D7 | 多设备并发 | 整卡 LWW by `updatedAt` | per-field LWW / vector clock = α-full 范围，过度工程 |
| D8 | CCv3 import/export | 复用现有 `addCard` 路径，import 后自动入 sync 队列 | — |

## 5. 数据模型

### 5.1 Server Schema

新建文件 `apps/server/src/schemas/user-characters.ts`：

```ts
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm'
import type { AiriCard } from '@proj-airi/stage-ui/types/airi-card'

import { index, jsonb, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'

import { nanoid } from '../utils/id'

// NOTICE: bare ownerId is intentional — no FK to user.id. better-auth hard-deletes
// the user row; a cascade would wipe these soft-delete archive rows.
// See `apps/server/docs/ai-context/account-deletion.md`.
export const userCharacters = pgTable(
  'user_characters',
  {
    id: text('id').primaryKey().$defaultFn(() => nanoid()),
    ownerId: text('owner_id').notNull(),

    // client 端 nanoid，跨设备稳定标识同一张卡。server 端 PUT 用它做 idempotency。
    clientId: text('client_id').notNull(),

    // 完整 CCv3 + airi extension，lossless 兜底。
    rawCard: jsonb('raw_card').notNull().$type<AiriCard>(),

    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
    deletedAt: timestamp('deleted_at'),
  },
  table => ({
    ownerClientUniq: uniqueIndex('user_characters_owner_client_uniq').on(table.ownerId, table.clientId),
    ownerIdx: index('user_characters_owner_idx').on(table.ownerId),
  }),
)

export type UserCharacter = InferSelectModel<typeof userCharacters>
export type NewUserCharacter = InferInsertModel<typeof userCharacters>

export const userActiveCharacter = pgTable(
  'user_active_character',
  {
    ownerId: text('owner_id').primaryKey(),
    activeClientId: text('active_client_id').notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
)

export type UserActiveCharacter = InferSelectModel<typeof userActiveCharacter>
```

### 5.2 Client Internal State

`useAiriCardStore` 现有 `cards: Map<string, AiriCard>` + `activeCardId: string` 不变。新增 internal：

```ts
type SyncOp = { kind: 'upsert' | 'delete', clientId: string }

interface SyncState {
  status: 'offline' | 'unauthenticated' | 'syncing' | 'synced' | 'error'
  pendingOps: Map<string, SyncOp>           // by clientId, 最后一笔操作覆盖前面
  lastSyncedAt: number | null
  lastError: string | null
}
```

`pendingOps` 持久化到 `localStorage` 一个独立 key（`airi-cards-pending-ops`），App 重启后能继续 flush。

## 6. API 设计

新建 `apps/server/src/routes/user-characters/`：

| Method | Path | 用途 | Body |
|--------|------|------|------|
| GET | `/user-characters` | 列出当前用户全部卡 (含 tombstone) | — |
| PUT | `/user-characters/:clientId` | upsert 一张卡（按 ownerId+clientId 唯一）；LWW by `updatedAt` | `{ rawCard: AiriCard, updatedAt: string }` |
| DELETE | `/user-characters/:clientId` | soft delete (set `deletedAt = now()`) | — |
| GET | `/user-characters/active` | 取当前 activeClientId | — |
| PUT | `/user-characters/active` | 设置 activeClientId | `{ activeClientId: string }` |

所有路由走 `authGuard`，按 `ownerId = currentUser.id` 过滤。

PUT `/user-characters/:clientId` 的 LWW 逻辑：
- 不存在 → INSERT
- 存在且 `deletedAt IS NULL`：
  - `incoming.updatedAt > existing.updatedAt` → UPDATE
  - `incoming.updatedAt <= existing.updatedAt` → 返回 200 + existing（不覆盖；客户端发现 server 比自己新会拉回来）
- 存在且 `deletedAt IS NOT NULL`（tombstone）：
  - `incoming.updatedAt > existing.deletedAt` → **复活**：清 `deletedAt` + UPDATE 内容（last operation wins，不论是 edit 还是 delete）
  - `incoming.updatedAt <= existing.deletedAt` → 返回 200 + tombstone（编辑发生在删除前，不复活；客户端拉回 tombstone 后会本地删除）

DELETE 走相同的 LWW，比较 `incoming.deletedAt` (= now()) 与 `existing.updatedAt`：
- `incoming.deletedAt > existing.updatedAt` → 设置 tombstone
- 否则 → 拒绝（罕见 case：client 本地 clock 漂移）

## 7. 同步流程（α-min）

### 7.1 First-Sync（登录后首次）

```
                    GET /user-characters
                    ┌─────────────────────────────────┐
                    │                                 │
                    ▼                                 │
client.cards (Map<clientId, AiriCard>) ──┐            │
                                         ├── union ──▶│
server.user_characters (列表) ───────────┘   by         │
                                          clientId    │
                                          ▼           │
                  ┌───────────────────────────────────┘
                  │
                  ├─ local-only 卡（server 没有同 clientId）─▶ PUT 上传
                  ├─ server-only 卡 (deletedAt IS NULL)        ─▶ 加入 local Map
                  ├─ server-only 卡 (deletedAt IS NOT NULL)    ─▶ 忽略（tombstone，不需要回放到 local）
                  └─ 同 clientId 两边都有 ─▶ 比较 max(local.updatedAt) vs max(server.updatedAt, server.deletedAt)
                                              ├─ local 时间戳更新  ─▶ PUT 上传（server 接受 LWW，可能复活 tombstone）
                                              ├─ server.updatedAt 更新 ─▶ 写入 local Map
                                              └─ server.deletedAt 更新 ─▶ 从 local Map 删除
```

### 7.2 切账号（logout → login 不同账号）

logout 触发时：
1. 检查 `pendingOps` 非空 OR 本地有未同步过的卡（无 server 记录的 clientId）
2. 非空 → 弹 modal：「未同步的 N 张卡 — [归当前账号 (上传后再 logout)] [丢弃] [取消]」
3. 用户选「归当前账号」→ 等 sync queue flush 完成 → logout
4. 用户选「丢弃」→ wipe local `cards` Map + `pendingOps` → logout
5. login 后走 First-Sync

### 7.3 后续 Reconcile（登录态正常运行）

- `cards` Map watchDebounced(2s) 触发 → diff 出变更 → enqueue → flush
- `activeCardId` 变更 → debounce 1s → PUT `/user-characters/active`
- 失败 → 指数 backoff (1s → 2s → 4s ... cap 30s) → 网络恢复后 flush
- 离线 → ops 留在 `pendingOps`（已持久化），上线后 flush
- 启动 / window focus → GET `/user-characters` + `/user-characters/active` 拉一次（被动 pull）

## 8. Client 改造

### 8.1 `useAiriCardStore` 内部改造（调用面不变）

新增 `packages/stage-shared/src/sync/airi-cards-sync-engine.ts`（放 `stage-shared` 而非 `stage-ui`，理由：未来 settings sync 复用同一 engine — per AGENTS.md「shared logic in packages/」）：

- `enqueueUpsert(clientId)` / `enqueueDelete(clientId)`：立即把 op 推进 `pendingOps`，**不**触发网络请求
- `flush()`：把 `pendingOps` 批量 PUT/DELETE 到 server（debounced 2s）
- `firstSync(authedUserId)`：登录后调用一次，按 §7.1 算法
- `pullFromServer()`：focus / 启动调用，GET `/user-characters` + `/user-characters/active`

`useAiriCardStore` 内部：
- `addCard` / `updateCard` / `removeCard` 写完 `cards` Map 后**立即** `enqueueUpsert/enqueueDelete`（同步、无延迟）
- `flush()` 由 watchDebounced(2s) 在 `cards` 或 `pendingOps` 任一变化时触发
- 新增 internal `_hydrateFromServer(serverCards)` 用于 first-sync
- `pendingOps` 持久化到独立 localStorage key（`airi-cards-pending-ops`），App 启动时恢复，登录后第一件事是 flush

### 8.2 废 `stores/characters.ts` 孤岛

删除（不留 deprecation 包装层）：
- `packages/stage-ui/src/stores/characters.ts`
- `packages/stage-ui/src/services/characters.ts`
- `packages/stage-ui/src/models/characters.ts`
- `packages/stage-ui/src/types/character.ts`（除非 server route 仍引用，需先确认）
- `apps/stage-web/src/pages/settings/characters/`（整个目录）
- `apps/stage-web/src/pages/settings/characters/components/`

stage-web 的 `/settings/characters` 路由改重定向到 `/settings/airi-card`（已经是 stage-tamagotchi 在用的统一页）。

### 8.3 `stores/character/index.ts` facade 不动

Phase 2 处理。本 Phase 不动 [v2/index.vue](../../../packages/stage-pages/src/pages/v2/index.vue) 和 devtools/context-flow 的调用方。

## 9. 错误处理

| 场景 | 处理 |
|------|------|
| 网络错误 | sync 进 retry 队列；UI 在 settings/airi-card 顶部小 banner 显示「云同步暂时挂了，本地仍可编辑」 |
| 401 认证失效 | 清空 sync 队列；触发 logout flow（不弹切账号 modal — 因为不是用户主动 logout） |
| 400 schema 校验失败 | server 返回 valibot issues；client 把这张卡 mark `syncStatus=error`，pendingOps 中移除（避免无限重试），devtools 暴露原始 error |
| 5xx | retry queue + 指数 backoff |
| 启动时 server 不可达 | 进 `offline` 状态，本地照常使用，恢复后 first-sync |

## 10. Migration

- 旧用户升级版本：`useAiriCardStore` 加载现有 `localStorage['airi-cards']` Map（不变）
- 用户登录 → first-sync 把整个 Map 上传
- 不需要写一次性 migration script
- 现有 `localStorage` key 保留：`airi-cards`, `airi-card-active-id`

## 11. 测试策略

### Unit (Vitest)

- `airi-cards-sync-engine.spec.ts`
  - first-sync union 算法（all-local-only / all-server-only / mixed / 同 clientId LWW）
  - tombstone 抑制复活：local 修改 < server.deletedAt → server wins
  - enqueue/flush 队列幂等
  - `pendingOps` 持久化 + 启动恢复
  - 切账号 modal 三个分支（归当前 / 丢弃 / 取消）

- `routes/user-characters/route.test.ts`
  - CRUD（PUT idempotent by clientId）
  - ownership 隔离（用户 A 看不到用户 B 的卡）
  - LWW: 旧 updatedAt 的 PUT 不覆盖 server
  - soft delete 行为

### Integration

- `useAiriCardStore` first-sync 端到端（mock fetch + memdb）
- 401 触发的 silent logout flow

### Verification（端到端用户路径）

落到 `docs/ai/context/verifications/character-cards-cloud-sync-phase-1.md`。每条用户路径一个文件。Phase 1 必须通过的：

| # | 用户路径 | 验证命令/操作 | 预期 |
|---|---------|--------------|------|
| V1 | 未登录用户继续创建/编辑卡 | 启动 stage-tamagotchi 不登录 → 创建卡 ARIA → 重启 | ARIA 仍在 |
| V2 | 首次登录上传本地卡 | V1 之后登录账号 X → web 端登录账号 X | web 端看到 ARIA |
| V3 | 多设备增量同步 | 桌面编辑 ARIA personality → 等 watchDebounced(2s) flush → web 端切回 tab 触发 focus pull | web 端看到更新 |
| V4 | 多设备删除同步 | 桌面 delete ARIA → 等 flush → web 端切回 tab 触发 focus pull | ARIA 不见 |
| V5 | 切账号确认 modal | 已登录 X 创建未同步本地卡 B → logout | 弹 modal「B 归 X / 丢弃 / 取消」 |
| V6 | activeCard 多端切换 | 桌面切到 ARIA → web 端 reload | web 端 active 是 ARIA |
| V7 | 离线编辑 + 上线 flush | 离线创建/编辑卡 → 上线 5s | 云端可见 |
| V8 | 孤岛页清理 | 升级前在 stage-web/settings/characters 用过该页 | 升级后路由 redirect 到 /settings/airi-card，孤岛页不存在 |

## 12. Open Questions（写 plan 时再钉）

- **Q1**：现有 `stores/characters.ts` 孤岛页用户已创建的关系化数据（`character` + `character_i18n` + `character_capabilities`）怎么处理？
  - 选项 A：写 transform script `relational → AiriCard CCv3` 一次性 migrate 进 `user_characters`
  - 选项 B：冷处理 + 在迁移说明里告知「此页面已停用，原数据请重新创建」
  - 倾向 B（孤岛页用户极少，transform 边界 case 多易出 bug）。需用户确认。

- **Q2**：`activeClientId` 为什么单独一张表而不是给 `user_characters` 加 `isActive` 字段？
  - 单独表：每用户至多一行，PK = ownerId，更新简单；不需要清旧 active
  - 加字段：要保证「至多一行 isActive=true」需要 partial unique index + 切换时事务
  - 倾向单独表。需用户确认。

- **Q3**：(已在 §8.1 决定 sync engine 放 `packages/stage-shared/src/sync/`，理由：未来 settings sync 复用 + AGENTS.md 「shared logic in packages/」)

---

> **Next**：approve 后调用 `superpowers:writing-plans` skill 生成实现计划。
> Phase 2 / 3 / settings-sync 不在本 spec 范围。
