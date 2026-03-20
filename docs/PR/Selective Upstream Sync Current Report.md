# Selective Upstream Sync Current Report (March 17, 2026)

## Comparison Basis

- **Baseline Upstream Head**: `65faf3fe1826804c41f46c66049ecac76d5cb303` (March 15)
- **Current Upstream Head**: `4671ceaaae92f5d780319394512bf63ed01a85f1`
- **Total Files Changed**: 13

## 📊 File Classification

### 🟢 `replace` (Safe / Direct Import)
These files contain environmental or build fixes that should be adopted fully.

| File | Change Summary |
| :--- | :--- |
| `apps/stage-pocket/vite.config.ts` | Fixes `@tresjs/core` import and sets `server.fs.strict: false`. |
| `apps/stage-tamagotchi/electron.vite.config.ts` | Fixes `@tresjs/core` import and sets `server.fs.strict: false`. |
| `apps/stage-web/vite.config.ts` | Fixes `@tresjs/core` import and sets `server.fs.strict: false`. |
| `eslint.config.js` | Adds `CLAUDE.md` to ignore list for cleaner linting. |
| `pnpm-workspace.yaml` | Adds `enableGlobalVirtualStore` and peerDeps fixes for `vue-sonner`, etc. |

### 🟡 `hand-merge` (Selective Integration)
These files involve core logic where the fork has diverged.

| File | Change Summary |
| :--- | :--- |
| `packages/stage-ui/src/stores/llm.ts` | **Critical**: Adds message flattening logic in `sanitizeMessages` for DeepSeek/OpenAI compatibility. |

### 🔵 `review` (Further Inspection Needed)
Files that change core dependency mappings or lockfiles.

| File | Change Summary |
| :--- | :--- |
| `pnpm-lock.yaml` | Updated dependencies (huggingface, eslint, intlify). |

### ⚪ `ignore` (No Action Required)
Unrelated churn or documentation specific to upstream.

| File | Change Summary |
| :--- | :--- |
| `.github/workflows/ci.yml` | Workflow updates. |
| `.github/workflows/deploy-cloudflare-workers-preview-prepare.yml` | Deployment infra. |
| `.github/workflows/deploy-cloudflare-workers.yml` | Deployment infra. |
| `docs/content/zh-Hans/index.md` | Translation updates. |
| `packages/i18n/src/locales/zh-Hans/docs/theme.yaml` | i18n churn. |
| `packages/i18n/src/locales/zh-Hant/docs/theme.yaml` | i18n churn. |

## Next Steps
1. Perform **hand-merge** of `llm.ts` logic into the fork's state.
2. **Replace** the build configurations and workspace settings to resolve FS strict errors.
3. Update version metadata in the fork to reflect sync up to `4671cea`.
