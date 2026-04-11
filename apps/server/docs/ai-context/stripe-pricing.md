# Stripe Pricing Architecture

## 设计决策

Stripe 是 Flux 充值定价的**单一真相源**。服务端不再在 Redis 维护 `FLUX_PACKAGES`，所有 package 信息直接从 Stripe API 获取。

### 为什么不用 Redis 维护 packages

之前的设计在 Redis ConfigKV 中维护 `FLUX_PACKAGES`（含 amount、label、price 等），导致：

- 价格信息在 Stripe 和 Redis 之间重复维护
- currency 硬编码为 USD，无法支持微信支付（需要 CNY/GBP）
- 新增/修改 package 需要同时改 Stripe 和 Redis

现在只需在 Stripe Dashboard 操作 Product/Price，服务端自动同步。

## 数据模型

### Stripe 侧

- **Product** — 代表 "Flux 充值" 这个商品（一个即可）
- **Price** — 代表一个具体的价格方案，每个 Price 包含：
  - `unit_amount` + `currency`（如 300 USD = $3）
  - `currency_options`（可选）— 支持多币种展示，如 `cny: { unit_amount: 2200 }`
  - `metadata.fluxAmount` — 购买此 Price 获得的 Flux 数量
  - `metadata.recommended` — （可选）设为 `'true'` 时前端会高亮展示为推荐套餐

Product ID 存储在 ConfigKV `STRIPE_FLUX_PRODUCT_ID` 中（运营配置，非环境变量）。

### 多币种支持

通过 Stripe Price 的 `currency_options` 实现。一个 USD Price 可以同时支持 CNY 结算：

- 前端展示所有可用货币（从 `currency_options` 自动提取），用户通过 SelectTab 切换
- 前端 checkout 时传 `{ stripePriceId, currency }` 给服务端
- 服务端在 Checkout Session 上设 `currency` 参数，Stripe 自动用对应 `currency_options` 的金额
- Stripe Checkout 页面根据货币自动展示兼容的支付方式（如 CNY → 微信支付）

**创建带多币种的 Price：**

```bash
curl https://api.stripe.com/v1/prices \
  -u "$STRIPE_API_KEY:" \
  -d "product=prod_xxx" \
  -d "unit_amount=300" \
  -d "currency=usd" \
  -d "metadata[fluxAmount]=500" \
  -d "currency_options[cny][unit_amount]=2200"
```

> 注意：Stripe CLI 的 `prices create` 对嵌套参数支持不好，`currency_options` 需要用 `curl` 直接调 API。

### 支付方式

`STRIPE_PAYMENT_METHODS` 在 ConfigKV 中为可选配置：

- **未设置（推荐）**：不传 `payment_method_types`，Stripe 根据 Dashboard 设置和货币自动决定
- **已设置**：覆盖 Stripe 自动选择，如 `["card", "wechat_pay", "alipay"]`

如果手动指定了 `wechat_pay`，还需设 `STRIPE_PAYMENT_METHOD_OPTIONS` 为 `{"wechat_pay":{"client":"web"}}`。

## 缓存

Stripe Price 列表通过 Redis 缓存（key: `cache:stripe:prices`，TTL 5 分钟），所有实例共享。

- 命中：直接返回缓存的 Price 列表
- 未命中：调 Stripe API `prices.list` (含 `expand: ['data.currency_options']`)，按 `unit_amount` 升序排列后写入缓存
- Checkout 时如果 priceId 不在缓存中，fallback 到 `prices.retrieve` 并 invalidate 缓存

## API 流程

### GET /api/v1/stripe/packages

1. 从 ConfigKV 读取 `STRIPE_FLUX_PRODUCT_ID`
2. 从 Redis 缓存或 Stripe API 获取 active prices
3. 返回每个 price 的所有可用货币价格：
   ```json
   {
     "stripePriceId": "price_xxx",
     "label": "500 Flux",
     "defaultCurrency": "usd",
     "currencies": { "usd": "$3.00", "cny": "¥22.00" },
     "recommended": false
   }
   ```

### POST /api/v1/stripe/checkout

1. 前端发送 `{ stripePriceId, currency? }`
2. 服务端验证 price 归属和 `fluxAmount` metadata
3. 创建 Checkout Session：
   - `currency` 参数（如有）让 Stripe 用 `currency_options` 中的金额
   - `payment_method_types` 根据 ConfigKV 是否配置决定传或不传
4. Webhook 收到 `checkout.session.completed` 后从 metadata 读取 fluxAmount 充值

## 运营操作

### 新增价格

用 curl 创建带多币种的 Price（Stripe CLI 不支持嵌套参数）：

```bash
curl https://api.stripe.com/v1/prices \
  -u "$STRIPE_API_KEY:" \
  -d "product=prod_xxx" \
  -d "unit_amount=1200" \
  -d "currency=usd" \
  -d "metadata[fluxAmount]=2000" \
  -d "metadata[recommended]=true" \
  -d "currency_options[cny][unit_amount]=8800"
```

无需修改代码或 Redis，`/packages` 端点在缓存过期后自动返回新 Price。

### 下架价格

在 Stripe Dashboard 将 Price 设为 inactive，缓存过期后 `/packages` 自动不再返回。

### 修改 Product ID

```bash
redis-cli SET "config:STRIPE_FLUX_PRODUCT_ID" '"prod_new_id"'
```

### 手动清缓存（立即生效）

```bash
redis-cli DEL "cache:stripe:prices"
```

## ConfigKV 配置清单

| Key | 类型 | 默认 | 说明 |
|-----|------|------|------|
| `STRIPE_FLUX_PRODUCT_ID` | `string?` | 无 | Stripe Product ID，未设置时 top-up 不可用 |
| `STRIPE_PAYMENT_METHODS` | `string[]?` | 无 | 不设则 Stripe 自动决定；设了则覆盖 |
| `STRIPE_PAYMENT_METHOD_OPTIONS` | `Record?` | `{}` | 支付方式选项，如 `{"wechat_pay":{"client":"web"}}` |
