# Channel Server QR Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render a Tauri settings connection QR card whose QR payload comes from `electron:server-channel:get-qr-payload` and encodes a valid websocket URL for the active channel server.

**Architecture:** Keep the feature narrow. Rust owns the active channel-server snapshot and returns the shared QR payload contract; Tauri Eventa exports the server-channel invoke; the stage-tauri renderer uses small tested helpers plus one app-local Vue card for `/settings/connection`.

**Tech Stack:** Rust/Tauri commands, serde JSON, Vue 3, Pinia-free local component state, `@moeru/eventa`, `@proj-airi/tauri-eventa`, `@proj-airi/tauri-vueuse`, `@proj-airi/stage-shared/server-channel-qr`, `uqr`, Vitest, Cargo tests.

## Global Constraints

- Work in `/home/vi/anima/.worktrees/channel-server-qr` on branch `vi/feat/channel-server-qr`.
- Keep the shared QR payload contract shape, for example `{ type: 'airi:server-channel', version: 1, urls: ['ws://192.168.1.10:49152/ws'], authToken: 'test-token' }`.
- Keep HTTP `/health` behavior separate; do not change `format_channel_server_url` or the channel-server health tests except as required by imports.
- Use the existing `uqr` catalog dependency; do not introduce a new QR rendering package.
- Generate websocket URLs with `ws://` and path `/ws`; TLS remains deferred.
- Return a Rust command error when no channel-server port is known, because the shared QR schema requires at least one URL.
- Do not migrate the full Electron settings router in this feature.
- The Serena and jcodemunch MCP tools required by `AGENTS.md` are unavailable in this environment; native CLI fallback is expected and must be listed in the final summary.
- Fresh-worktree `pnpm install --frozen-lockfile` is blocked by a pre-existing `@proj-airi/core-terminal` declaration output issue; use targeted commands and `pnpm install --lockfile-only --ignore-scripts` for lockfile importer updates.

---

## File Structure

- Modify `apps/stage-tauri/src/commands/server_channel.rs`
  - Owns Rust QR payload serialization and websocket URL generation.

- Modify `packages/tauri-eventa/src/contracts/index.ts`
  - Re-exports server-channel contracts from the package root.

- Create `packages/tauri-eventa/src/contracts/server-channel.ts`
  - Owns `electronGetServerChannelConfig`, `electronApplyServerChannelConfig`, and `electronGetServerChannelQrPayload`.

- Modify `packages/tauri-eventa/src/tauri/index.test.ts`
  - Proves server-channel Eventa invokes map to the expected Tauri command names.

- Modify `packages/tauri-eventa/package.json`, `packages/tauri-eventa/tsdown.config.ts`, and `pnpm-lock.yaml`
  - Adds the direct `@proj-airi/stage-shared` type dependency and exports/builds the new contract file.

- Modify `apps/stage-tauri/package.json` and `pnpm-lock.yaml`
  - Adds direct `@proj-airi/stage-shared` and `uqr` dependencies for the renderer.

- Create `apps/stage-tauri/src/settings-connection.ts`
  - Pure QR payload text, SVG data URL, and refresh-state helpers.

- Create `apps/stage-tauri/src/settings-connection.test.ts`
  - Tests helper behavior without loading the Live2D Vite plugin path.

- Modify `apps/stage-tauri/src/window-routes.ts` and `apps/stage-tauri/src/window-routes.test.ts`
  - Adds a specific route kind for `/settings/connection`.

- Create `apps/stage-tauri/src/components/ServerChannelQrCard.vue`
  - Renders the Tauri settings QR card.

- Modify `apps/stage-tauri/src/App.vue` and `apps/stage-tauri/src/styles.css`
  - Mounts and styles the QR card in the secondary window for `/settings/connection`.

- Modify mission ledger files under `docs/missions/d74b01dc-52da-4992-8a61-ea0a07bd800e/`
  - Records implementation evidence and remaining runtime screenshot evidence.

---

### Task 1: Rust QR Payload Contract

**Files:**
- Modify: `apps/stage-tauri/src/commands/server_channel.rs`

**Interfaces:**
- Consumes: `ChannelServerSnapshot`, `ChannelServerState`, and `preferred_qr_host(snapshot: &ChannelServerSnapshot) -> String`.
- Produces: `electron_server_channel_get_qr_payload(state: State<'_, ChannelServerState>) -> Result<ServerChannelQrPayload, String>` where JSON serialization matches the shared payload shape, for example `{ "type": "airi:server-channel", "version": 1, "urls": ["ws://192.168.1.10:49152/ws"], "authToken": "test-token" }`.

- [ ] **Step 1: Write failing Rust tests for the shared contract**

Replace the existing QR payload tests in `apps/stage-tauri/src/commands/server_channel.rs` with these tests:

```rust
    #[test]
    fn qr_payload_matches_shared_contract() {
        let payload = qr_payload_from_snapshot(&active_snapshot()).expect("active QR payload");
        let value = serde_json::to_value(&payload).expect("serializes QR payload");

        assert_eq!(
            value,
            serde_json::json!({
                "type": "airi:server-channel",
                "version": 1,
                "urls": ["ws://192.168.1.10:49152/ws"],
                "authToken": "test-token",
            })
        );
    }

    #[test]
    fn qr_payload_uses_websocket_path_and_ipv6_brackets() {
        let snapshot = ChannelServerSnapshot {
            hostname: "0.0.0.0".to_string(),
            port: Some(49152),
            lan_hosts: vec!["fe80::1".to_string()],
            auth_token: "test-token".to_string(),
            last_error: None,
        };

        let payload = qr_payload_from_snapshot(&snapshot).expect("active QR payload");

        assert_eq!(payload.urls, vec!["ws://[fe80::1]:49152/ws"]);
    }

    #[test]
    fn qr_payload_prefers_lan_host_when_server_is_started() {
        let payload = qr_payload_from_snapshot(&active_snapshot()).expect("active QR payload");

        assert_eq!(payload.urls, vec!["ws://192.168.1.10:49152/ws"]);
        assert_eq!(payload.auth_token, "test-token");
    }

    #[test]
    fn qr_payload_errors_until_server_port_is_known() {
        let error = qr_payload_from_snapshot(&ChannelServerSnapshot::default())
            .expect_err("portless snapshot cannot produce shared QR payload");

        assert_eq!(
            error,
            "Channel server QR payload is not available until the server has started."
        );
    }
```

- [ ] **Step 2: Run the Rust test and verify RED**

Run:

```bash
cargo test --manifest-path apps/stage-tauri/Cargo.toml server_channel
```

Expected: FAIL because `qr_payload_from_snapshot` currently returns `ServerChannelQrPayload` directly with fields `url` and `token`, not `Result<ServerChannelQrPayload, String>` with `urls` and `auth_token`.

- [ ] **Step 3: Implement the minimal Rust payload change**

In `apps/stage-tauri/src/commands/server_channel.rs`, replace the import and QR payload implementation with:

```rust
use crate::channel_server::{preferred_qr_host, ChannelServerSnapshot, ChannelServerState};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::State;

const SERVER_CHANNEL_QR_PAYLOAD_TYPE: &str = "airi:server-channel";
const SERVER_CHANNEL_QR_PAYLOAD_VERSION: u8 = 1;
const CHANNEL_SERVER_QR_UNAVAILABLE_ERROR: &str =
    "Channel server QR payload is not available until the server has started.";

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerChannelQrPayload {
    #[serde(rename = "type")]
    pub payload_type: String,
    pub version: u8,
    pub urls: Vec<String>,
    pub auth_token: String,
}
```

Replace the command and helper with:

```rust
/// Get QR payload for channel server connection
#[tauri::command]
pub async fn electron_server_channel_get_qr_payload(
    state: State<'_, ChannelServerState>,
) -> Result<ServerChannelQrPayload, String> {
    qr_payload_from_snapshot(&state.snapshot())
}

fn format_channel_server_websocket_url(hostname: &str, port: u16) -> String {
    let host = match hostname {
        "0.0.0.0" | "::" => "localhost".to_string(),
        value if value.contains(':') && !value.starts_with('[') => format!("[{value}]"),
        value => value.to_string(),
    };

    format!("ws://{host}:{port}/ws")
}

fn qr_payload_from_snapshot(
    snapshot: &ChannelServerSnapshot,
) -> Result<ServerChannelQrPayload, String> {
    let Some(port) = snapshot.port else {
        return Err(CHANNEL_SERVER_QR_UNAVAILABLE_ERROR.to_string());
    };

    let host = preferred_qr_host(snapshot);
    Ok(ServerChannelQrPayload {
        payload_type: SERVER_CHANNEL_QR_PAYLOAD_TYPE.to_string(),
        version: SERVER_CHANNEL_QR_PAYLOAD_VERSION,
        urls: vec![format_channel_server_websocket_url(&host, port)],
        auth_token: snapshot.auth_token.clone(),
    })
}
```

Leave `config_payload_from_snapshot` unchanged.

- [ ] **Step 4: Run the Rust test and verify GREEN**

Run:

```bash
cargo test --manifest-path apps/stage-tauri/Cargo.toml server_channel
```

Expected: PASS. Known unrelated warnings about placeholder command payload structs may remain.

- [ ] **Step 5: Format Rust**

Run:

```bash
cargo fmt --manifest-path apps/stage-tauri/Cargo.toml --check
```

Expected: PASS. If it fails only due to formatting, run:

```bash
cargo fmt --manifest-path apps/stage-tauri/Cargo.toml
```

Then rerun the `--check` command.

- [ ] **Step 6: Commit Task 1**

```bash
git add apps/stage-tauri/src/commands/server_channel.rs
git commit -m "fix(stage-tauri): return shared server channel qr payload" \
  -m "Tests: cargo test --manifest-path apps/stage-tauri/Cargo.toml server_channel; cargo fmt --manifest-path apps/stage-tauri/Cargo.toml --check"
```

---

### Task 2: Tauri Eventa Server-Channel Contract

**Files:**
- Create: `packages/tauri-eventa/src/contracts/server-channel.ts`
- Modify: `packages/tauri-eventa/src/contracts/index.ts`
- Modify: `packages/tauri-eventa/src/tauri/index.test.ts`
- Modify: `packages/tauri-eventa/package.json`
- Modify: `packages/tauri-eventa/tsdown.config.ts`
- Modify: `pnpm-lock.yaml`

**Interfaces:**
- Consumes: `ServerChannelQrPayload` from `@proj-airi/stage-shared/server-channel-qr`.
- Produces: `electronGetServerChannelQrPayload` exported from `@proj-airi/tauri-eventa`.

- [ ] **Step 1: Write failing Eventa adapter test**

In `packages/tauri-eventa/src/tauri/index.test.ts`, add `electronGetServerChannelQrPayload` to the contracts import:

```ts
import {
  electron,
  electronGetServerChannelQrPayload,
  electronGetWindowLifecycleState,
  stageTauriManagedWindowOpen,
  widgetsAdd,
  widgetsFetch,
  widgetsPrepareWindow,
} from '../contracts'
```

Add this test near the other invoke mapping tests:

```ts
  it('maps server-channel QR payload invokes to the registered Tauri command', async () => {
    const internals = buildMockInternals()
    ;(internals.invoke as any).mockResolvedValue({
      type: 'airi:server-channel',
      version: 1,
      urls: ['ws://192.168.1.10:49152/ws'],
      authToken: 'test-token',
    })

    const { context } = createContextFromTauriIpc(internals)
    const getQrPayload = defineInvoke(context, electronGetServerChannelQrPayload)

    const result = await getQrPayload()

    expect(internals.invoke).toHaveBeenCalledWith('electron_server_channel_get_qr_payload', undefined)
    expect(result).toEqual({
      type: 'airi:server-channel',
      version: 1,
      urls: ['ws://192.168.1.10:49152/ws'],
      authToken: 'test-token',
    })
  })
```

- [ ] **Step 2: Run the Eventa test and verify RED**

Run:

```bash
pnpm -F @proj-airi/tauri-eventa exec vitest run src/tauri/index.test.ts
```

Expected: FAIL at import/typecheck time because `electronGetServerChannelQrPayload` is not exported from `../contracts`.

- [ ] **Step 3: Add server-channel contracts**

Create `packages/tauri-eventa/src/contracts/server-channel.ts`:

```ts
import type { ServerChannelQrPayload } from '@proj-airi/stage-shared/server-channel-qr'

import { defineInvokeEventa } from '@moeru/eventa'

export interface ElectronServerChannelConfig {
  tlsConfig?: unknown | null
  authToken: string
  hostname: string
}

export const electronGetServerChannelConfig = defineInvokeEventa<ElectronServerChannelConfig>(
  'eventa:invoke:electron:server-channel:get-config',
)

export const electronApplyServerChannelConfig = defineInvokeEventa<
  ElectronServerChannelConfig,
  Partial<ElectronServerChannelConfig>
>('eventa:invoke:electron:server-channel:apply-config')

export const electronGetServerChannelQrPayload = defineInvokeEventa<ServerChannelQrPayload>(
  'eventa:invoke:electron:server-channel:get-qr-payload',
)
```

In `packages/tauri-eventa/src/contracts/index.ts`, add this export with the other top-level contract exports:

```ts
export {
  electronApplyServerChannelConfig,
  electronGetServerChannelConfig,
  electronGetServerChannelQrPayload,
  type ElectronServerChannelConfig,
} from './server-channel'
```

In `packages/tauri-eventa/tsdown.config.ts`, add the new entry:

```ts
    './src/contracts/server-channel.ts',
```

Place it next to the other `./src/contracts/*.ts` entries.

In `packages/tauri-eventa/package.json`, add the export:

```json
    "./contracts/server-channel": "./dist/contracts/server-channel.mjs",
```

Add the direct dependency:

```json
    "@proj-airi/stage-shared": "workspace:^",
```

The dependency block should still contain `@moeru/eventa` and `@tauri-apps/api`.

- [ ] **Step 4: Update lockfile importer without scripts**

Run:

```bash
pnpm install --lockfile-only --ignore-scripts
```

Expected: exit 0 and `pnpm-lock.yaml` updates the `packages/tauri-eventa` importer with `@proj-airi/stage-shared`.

- [ ] **Step 5: Run Eventa tests and typecheck**

Run:

```bash
pnpm -F @proj-airi/tauri-eventa exec vitest run src/tauri/index.test.ts
pnpm -F @proj-airi/tauri-eventa typecheck
```

Expected: both PASS.

- [ ] **Step 6: Commit Task 2**

```bash
git add packages/tauri-eventa/src/contracts/server-channel.ts \
  packages/tauri-eventa/src/contracts/index.ts \
  packages/tauri-eventa/src/tauri/index.test.ts \
  packages/tauri-eventa/package.json \
  packages/tauri-eventa/tsdown.config.ts \
  pnpm-lock.yaml
git commit -m "feat(tauri-eventa): export server channel contracts" \
  -m "Tests: pnpm -F @proj-airi/tauri-eventa exec vitest run src/tauri/index.test.ts; pnpm -F @proj-airi/tauri-eventa typecheck"
```

---

### Task 3: Stage-Tauri QR Helpers

**Files:**
- Create: `apps/stage-tauri/src/settings-connection.ts`
- Create: `apps/stage-tauri/src/settings-connection.test.ts`
- Modify: `apps/stage-tauri/package.json`
- Modify: `pnpm-lock.yaml`

**Interfaces:**
- Consumes: `ServerChannelQrPayload` from `@proj-airi/stage-shared/server-channel-qr`.
- Produces:
  - `serverChannelQrPayloadText(payload: ServerChannelQrPayload | null | undefined): string`
  - `serverChannelQrSvgDataUrl(payload: ServerChannelQrPayload | null | undefined): string`
  - `createServerChannelQrPayloadController(loadPayload: () => Promise<ServerChannelQrPayload>)`

- [ ] **Step 1: Add failing helper tests**

Create `apps/stage-tauri/src/settings-connection.test.ts`:

```ts
import type { ServerChannelQrPayload } from '@proj-airi/stage-shared/server-channel-qr'

import { describe, expect, it, vi } from 'vitest'

import {
  createServerChannelQrPayloadController,
  serverChannelQrPayloadText,
  serverChannelQrSvgDataUrl,
} from './settings-connection'

const payload: ServerChannelQrPayload = {
  type: 'airi:server-channel',
  version: 1,
  urls: ['ws://192.168.1.10:49152/ws'],
  authToken: 'test-token',
}

describe('settings connection QR helpers', () => {
  it('serializes the exact shared QR payload JSON', () => {
    expect(serverChannelQrPayloadText(payload)).toBe(JSON.stringify(payload))
  })

  it('builds an SVG data URL for an available payload', () => {
    const source = serverChannelQrSvgDataUrl(payload)
    const prefix = 'data:image/svg+xml;utf8,'
    const svg = decodeURIComponent(source.slice(prefix.length))

    expect(source.startsWith(prefix)).toBe(true)
    expect(svg).toContain('<svg')
    expect(svg).toContain('#FFFFFF')
    expect(svg).toContain('#121212')
  })

  it('returns an empty QR source for an unavailable payload', () => {
    expect(serverChannelQrPayloadText(undefined)).toBe('')
    expect(serverChannelQrPayloadText({ ...payload, urls: [] })).toBe('')
    expect(serverChannelQrSvgDataUrl(undefined)).toBe('')
    expect(serverChannelQrSvgDataUrl({ ...payload, urls: [] })).toBe('')
  })

  it('refreshes payload state from the supplied loader', async () => {
    const loadPayload = vi.fn(async () => payload)
    const controller = createServerChannelQrPayloadController(loadPayload)

    await controller.refreshPayload()

    expect(loadPayload).toHaveBeenCalledOnce()
    expect(controller.loading.value).toBe(false)
    expect(controller.errorMessage.value).toBe('')
    expect(controller.payload.value).toEqual(payload)
    expect(controller.candidateUrls.value).toEqual(['ws://192.168.1.10:49152/ws'])
    expect(controller.payloadText.value).toBe(JSON.stringify(payload))
    expect(controller.qrCodeSource.value.startsWith('data:image/svg+xml;utf8,')).toBe(true)
  })

  it('clears stale payload and stores error text when refresh fails', async () => {
    const controller = createServerChannelQrPayloadController(async () => payload)
    await controller.refreshPayload()

    const failingController = createServerChannelQrPayloadController(async () => {
      throw new Error('server not ready')
    })

    await failingController.refreshPayload()

    expect(failingController.loading.value).toBe(false)
    expect(failingController.payload.value).toBeUndefined()
    expect(failingController.errorMessage.value).toBe('server not ready')
    expect(failingController.qrCodeSource.value).toBe('')
  })
})
```

- [ ] **Step 2: Run helper tests and verify RED**

Run:

```bash
pnpm -F @proj-airi/stage-tauri exec vitest run src/settings-connection.test.ts
```

Expected: FAIL because `src/settings-connection.ts` does not exist.

- [ ] **Step 3: Add direct renderer dependencies**

In `apps/stage-tauri/package.json`, add dependencies:

```json
    "@proj-airi/stage-shared": "workspace:^",
    "uqr": "catalog:",
```

Keep dependency keys alphabetically grouped with the surrounding package style.

- [ ] **Step 4: Update lockfile importer without scripts**

Run:

```bash
pnpm install --lockfile-only --ignore-scripts
```

Expected: exit 0 and `pnpm-lock.yaml` updates the `apps/stage-tauri` importer with `@proj-airi/stage-shared` and `uqr`.

- [ ] **Step 5: Implement QR helpers**

Create `apps/stage-tauri/src/settings-connection.ts`:

```ts
import type { ComputedRef, ShallowRef } from 'vue'
import type { ServerChannelQrPayload } from '@proj-airi/stage-shared/server-channel-qr'

import { computed, shallowRef } from 'vue'
import { renderSVG } from 'uqr'

const QR_SVG_DATA_URL_PREFIX = 'data:image/svg+xml;utf8,'
const DEFAULT_QR_ERROR_MESSAGE = 'Channel server QR payload is unavailable.'

function hasCandidateUrl(payload: ServerChannelQrPayload | null | undefined): payload is ServerChannelQrPayload {
  return Boolean(payload?.urls?.length)
}

function messageFromError(error: unknown): string {
  if (error instanceof Error && error.message) return error.message
  if (typeof error === 'string' && error) return error
  return DEFAULT_QR_ERROR_MESSAGE
}

export function serverChannelQrPayloadText(payload: ServerChannelQrPayload | null | undefined): string {
  if (!hasCandidateUrl(payload)) return ''
  return JSON.stringify(payload)
}

export function serverChannelQrSvgDataUrl(payload: ServerChannelQrPayload | null | undefined): string {
  const payloadText = serverChannelQrPayloadText(payload)
  if (!payloadText) return ''

  const svg = renderSVG(payloadText, {
    border: 2,
    ecc: 'M',
    pixelSize: 8,
    whiteColor: '#FFFFFF',
    blackColor: '#121212',
  })

  return `${QR_SVG_DATA_URL_PREFIX}${encodeURIComponent(svg)}`
}

export interface ServerChannelQrPayloadController {
  loading: ShallowRef<boolean>
  payload: ShallowRef<ServerChannelQrPayload | undefined>
  errorMessage: ShallowRef<string>
  candidateUrls: ComputedRef<string[]>
  payloadText: ComputedRef<string>
  qrCodeSource: ComputedRef<string>
  refreshPayload: () => Promise<void>
}

export function createServerChannelQrPayloadController(
  loadPayload: () => Promise<ServerChannelQrPayload>,
): ServerChannelQrPayloadController {
  const loading = shallowRef(false)
  const payload = shallowRef<ServerChannelQrPayload>()
  const errorMessage = shallowRef('')

  const candidateUrls = computed(() => payload.value?.urls ?? [])
  const payloadText = computed(() => serverChannelQrPayloadText(payload.value))
  const qrCodeSource = computed(() => serverChannelQrSvgDataUrl(payload.value))

  async function refreshPayload() {
    loading.value = true
    errorMessage.value = ''

    try {
      payload.value = await loadPayload()
    } catch (error) {
      payload.value = undefined
      errorMessage.value = messageFromError(error)
    } finally {
      loading.value = false
    }
  }

  return {
    loading,
    payload,
    errorMessage,
    candidateUrls,
    payloadText,
    qrCodeSource,
    refreshPayload,
  }
}
```

- [ ] **Step 6: Run helper tests and verify GREEN**

Run:

```bash
pnpm -F @proj-airi/stage-tauri exec vitest run src/settings-connection.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit Task 3**

```bash
git add apps/stage-tauri/package.json \
  apps/stage-tauri/src/settings-connection.ts \
  apps/stage-tauri/src/settings-connection.test.ts \
  pnpm-lock.yaml
git commit -m "feat(stage-tauri): add server channel qr helpers" \
  -m "Tests: pnpm -F @proj-airi/stage-tauri exec vitest run src/settings-connection.test.ts"
```

---

### Task 4: Settings Connection Route Selection

**Files:**
- Modify: `apps/stage-tauri/src/window-routes.ts`
- Modify: `apps/stage-tauri/src/window-routes.test.ts`

**Interfaces:**
- Consumes: current hash route and Tauri window label.
- Produces: `StageTauriWindowRoute.kind === 'settings-connection'` for `#/settings/connection`.

- [ ] **Step 1: Write failing route test**

In `apps/stage-tauri/src/window-routes.test.ts`, add:

```ts
  it('selects the settings connection QR view for the settings connection route', () => {
    expect(resolveStageTauriWindowRoute('#/settings/connection', 'settings')).toMatchObject({
      kind: 'settings-connection',
      label: 'settings',
      route: '/settings/connection',
      title: 'Connection',
    })
  })
```

- [ ] **Step 2: Run route test and verify RED**

Run:

```bash
pnpm -F @proj-airi/stage-tauri exec vitest run src/window-routes.test.ts
```

Expected: FAIL because the resolver currently returns `kind: 'secondary'` and title `Settings`.

- [ ] **Step 3: Implement route kind**

In `apps/stage-tauri/src/window-routes.ts`, update the interface:

```ts
export interface StageTauriWindowRoute {
  kind: 'stage' | 'secondary' | 'settings-connection'
  label: string
  route: string
  title: string
}
```

In `resolveStageTauriWindowRoute`, add this block after the main-window stage block and before `routeKey` is computed:

```ts
  if (route === '/settings/connection') {
    return {
      kind: 'settings-connection',
      label,
      route,
      title: 'Connection',
    }
  }
```

- [ ] **Step 4: Run route test and verify GREEN**

Run:

```bash
pnpm -F @proj-airi/stage-tauri exec vitest run src/window-routes.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit Task 4**

```bash
git add apps/stage-tauri/src/window-routes.ts apps/stage-tauri/src/window-routes.test.ts
git commit -m "feat(stage-tauri): route settings connection qr view" \
  -m "Tests: pnpm -F @proj-airi/stage-tauri exec vitest run src/window-routes.test.ts"
```

---

### Task 5: Settings QR Vue View

**Files:**
- Create: `apps/stage-tauri/src/components/ServerChannelQrCard.vue`
- Modify: `apps/stage-tauri/src/App.vue`
- Modify: `apps/stage-tauri/src/styles.css`

**Interfaces:**
- Consumes:
  - `electronGetServerChannelQrPayload` from `@proj-airi/tauri-eventa`.
  - `useElectronEventaInvoke` from `@proj-airi/tauri-vueuse`.
  - `createServerChannelQrPayloadController` from `./settings-connection`.
- Produces: visible QR card in the Tauri secondary window when `windowRoute.kind === 'settings-connection'`.

- [ ] **Step 1: Write a failing type-level integration check**

Run the existing typecheck before adding the component:

```bash
pnpm -F @proj-airi/stage-tauri typecheck
```

Expected: PASS before the component. If this fails due to unrelated repo type drift, record the exact error and continue with the narrower Vitest and build checks.

Then add this temporary import line at the top of `apps/stage-tauri/src/App.vue`:

```ts
import ServerChannelQrCard from './components/ServerChannelQrCard.vue'
```

Do not create the component yet.

- [ ] **Step 2: Run typecheck and verify RED**

Run:

```bash
pnpm -F @proj-airi/stage-tauri typecheck
```

Expected: FAIL because `./components/ServerChannelQrCard.vue` does not exist.

- [ ] **Step 3: Create the QR card component**

Create `apps/stage-tauri/src/components/ServerChannelQrCard.vue`:

```vue
<script setup lang="ts">
import { electronGetServerChannelQrPayload } from '@proj-airi/tauri-eventa'
import { useElectronEventaInvoke } from '@proj-airi/tauri-vueuse'
import { onMounted } from 'vue'

import { createServerChannelQrPayloadController } from '../settings-connection'

const getServerChannelQrPayload = useElectronEventaInvoke(electronGetServerChannelQrPayload)
const {
  loading,
  errorMessage,
  candidateUrls,
  qrCodeSource,
  refreshPayload,
} = createServerChannelQrPayloadController(getServerChannelQrPayload)

onMounted(() => {
  void refreshPayload()
})
</script>

<template>
  <section class="server-channel-qr-card" aria-label="Server channel QR">
    <div class="qr-card-header">
      <div>
        <p class="eyebrow">Connection</p>
        <h2>Server channel QR</h2>
        <p class="qr-card-description">
          Scan from another AIRI client on this network.
        </p>
      </div>
      <button
        class="qr-refresh-button"
        type="button"
        :disabled="loading"
        @click="refreshPayload"
      >
        {{ loading ? 'Refreshing' : 'Refresh' }}
      </button>
    </div>

    <p v-if="errorMessage" class="qr-error">
      {{ errorMessage }}
    </p>

    <div v-else-if="qrCodeSource" class="qr-content">
      <img class="qr-image" :src="qrCodeSource" alt="Server channel QR code" />
      <div class="qr-details">
        <p class="panel-title">Candidate URL</p>
        <ul class="qr-url-list" aria-label="Server channel candidate URLs">
          <li v-for="url in candidateUrls" :key="url">
            {{ url }}
          </li>
        </ul>
      </div>
    </div>

    <p v-else class="panel-text">
      Channel server QR is not available yet.
    </p>
  </section>
</template>
```

- [ ] **Step 4: Render the component for the route**

Keep the `ServerChannelQrCard` import in `apps/stage-tauri/src/App.vue`.

Inside the secondary-window template, replace the first route-specific panel block:

```vue
      <div v-if="isNoticeRoute(windowRoute.route)" class="secondary-panel">
```

with:

```vue
      <div v-if="windowRoute.kind === 'settings-connection'" class="secondary-panel secondary-panel-block">
        <ServerChannelQrCard />
      </div>
      <div v-else-if="isNoticeRoute(windowRoute.route)" class="secondary-panel">
```

- [ ] **Step 5: Add stable QR view styles**

Append to `apps/stage-tauri/src/styles.css`:

```css
.secondary-panel-block {
  display: block;
}

.server-channel-qr-card {
  display: flex;
  flex-direction: column;
  gap: 18px;
  max-width: 760px;
}

.qr-card-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.qr-card-header h2 {
  margin: 0;
  color: #edf3fb;
  font-size: 18px;
  line-height: 1.25;
}

.qr-card-description {
  margin: 8px 0 0;
  color: #b9c5d6;
  font-size: 13px;
  line-height: 1.5;
}

.qr-refresh-button {
  min-width: 96px;
  border: 1px solid rgb(255 255 255 / 18%);
  border-radius: 6px;
  background: #23483f;
  color: #eefaf6;
  cursor: pointer;
  font: inherit;
  font-size: 13px;
  font-weight: 700;
  padding: 9px 12px;
}

.qr-refresh-button:disabled {
  cursor: default;
  opacity: 0.56;
}

.qr-error {
  margin: 0;
  border: 1px solid rgb(255 183 77 / 36%);
  border-radius: 6px;
  background: rgb(132 76 18 / 22%);
  color: #ffdca8;
  font-size: 13px;
  line-height: 1.5;
  padding: 12px;
}

.qr-content {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 18px;
  align-items: start;
}

.qr-image {
  width: 192px;
  height: 192px;
  border-radius: 6px;
  background: #ffffff;
  padding: 8px;
}

.qr-details {
  min-width: 0;
}

.qr-url-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 10px 0 0;
  padding: 0;
  list-style: none;
}

.qr-url-list li {
  border: 1px solid rgb(255 255 255 / 10%);
  border-radius: 6px;
  background: rgb(0 0 0 / 22%);
  color: #d8e1ee;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace;
  font-size: 12px;
  line-height: 1.5;
  overflow-wrap: anywhere;
  padding: 10px 12px;
}

@media (max-width: 640px) {
  .qr-card-header,
  .qr-content {
    grid-template-columns: 1fr;
  }

  .qr-card-header {
    flex-direction: column;
  }

  .qr-image {
    width: 176px;
    height: 176px;
  }
}
```

- [ ] **Step 6: Run focused tests and typecheck**

Run:

```bash
pnpm -F @proj-airi/stage-tauri exec vitest run src/settings-connection.test.ts src/window-routes.test.ts
pnpm -F @proj-airi/stage-tauri typecheck
```

Expected: both PASS. If `stage-tauri` typecheck fails due to an unrelated upstream type issue, record the exact error and continue to Rust and helper tests.

- [ ] **Step 7: Commit Task 5**

```bash
git add apps/stage-tauri/src/components/ServerChannelQrCard.vue \
  apps/stage-tauri/src/App.vue \
  apps/stage-tauri/src/styles.css
git commit -m "feat(stage-tauri): render server channel qr card" \
  -m "Tests: pnpm -F @proj-airi/stage-tauri exec vitest run src/settings-connection.test.ts src/window-routes.test.ts; pnpm -F @proj-airi/stage-tauri typecheck"
```

---

### Task 6: Full Verification and Mission Ledger

**Files:**
- Modify: `docs/missions/d74b01dc-52da-4992-8a61-ea0a07bd800e/features.json`
- Modify: `docs/missions/d74b01dc-52da-4992-8a61-ea0a07bd800e/validation-state.json`
- Modify: `docs/missions/d74b01dc-52da-4992-8a61-ea0a07bd800e/progress_log.jsonl`

**Interfaces:**
- Consumes: all implementation commits from Tasks 1-5.
- Produces: mission ledger entries for `channel-server-qr` and `VAL-TAURI-SRV-002`.

- [ ] **Step 1: Run final automated verification**

Run:

```bash
cargo fmt --manifest-path apps/stage-tauri/Cargo.toml --check
cargo test --manifest-path apps/stage-tauri/Cargo.toml server_channel
cargo test --manifest-path apps/stage-tauri/Cargo.toml channel_server
cargo test --manifest-path apps/stage-tauri/Cargo.toml
pnpm -F @proj-airi/tauri-eventa exec vitest run src/tauri/index.test.ts
pnpm -F @proj-airi/tauri-eventa typecheck
pnpm -F @proj-airi/stage-tauri exec vitest run src/settings-connection.test.ts src/window-routes.test.ts
pnpm -F @proj-airi/stage-tauri typecheck
git diff --check
```

Expected: all pass except known baseline/environment issues already documented. Record every command and exit status for the handoff.

- [ ] **Step 2: Attempt stage-tauri build**

Run:

```bash
pnpm -F @proj-airi/stage-tauri build
```

Expected: PASS when Live2D SDK assets are available. If it stalls or fails while downloading/materializing the Cubism SDK, stop it after a reasonable wait and record the asset-path blocker exactly.

- [ ] **Step 3: Attempt runtime screenshot evidence**

Run the Tauri app:

```bash
cargo tauri dev
```

Open the settings window to `#/settings/connection` using the existing managed-window flow or direct URL route. Capture a screenshot showing:

```text
Server channel QR
ws://192.168.1.10:49152/ws
```

If the desktop runtime cannot be launched from this session, record runtime screenshot evidence as pending.

- [ ] **Step 4: Update mission ledger with a deterministic script**

Run this from `/home/vi/anima/.worktrees/channel-server-qr` after the implementation commits and before the ledger commit:

```bash
node <<'NODE'
import fs from 'node:fs'
import { execSync } from 'node:child_process'

const missionDir = 'docs/missions/d74b01dc-52da-4992-8a61-ea0a07bd800e'
const workerSessionId = 'codex-orchestrator-2026-07-05-channel-server-qr'
const featureId = 'channel-server-qr'
const commitId = execSync('git rev-parse --short HEAD').toString().trim()
const branch = execSync('git branch --show-current').toString().trim()
const now = new Date().toISOString()

const featuresPath = `${missionDir}/features.json`
const featuresDoc = JSON.parse(fs.readFileSync(featuresPath, 'utf8'))
const feature = featuresDoc.features.find((entry) => entry.id === featureId)
if (!feature) throw new Error(`Missing feature ${featureId}`)

feature.status = 'implementation-complete-runtime-evidence-pending'
feature.workerSessionIds = Array.from(new Set([...(feature.workerSessionIds ?? []), workerSessionId]))
feature.currentWorkerSessionId = null
feature.completedWorkerSessionId = workerSessionId
feature.commit = commitId
feature.commitId = commitId
feature.completedAt = now
feature.implementationNotes = [
  'Tauri server-channel QR payload now matches the shared AIRI QR contract with type/version/urls/authToken.',
  'QR candidate URLs use the ws:// scheme with /ws path and prefer the discovered LAN host when available.',
  'The Tauri settings connection route renders an app-local QR card from electron:server-channel:get-qr-payload.',
]
fs.writeFileSync(featuresPath, `${JSON.stringify(featuresDoc, null, 2)}\n`)

const validationPath = `${missionDir}/validation-state.json`
const validationDoc = JSON.parse(fs.readFileSync(validationPath, 'utf8'))
validationDoc.assertions['VAL-TAURI-SRV-002'] = {
  status: 'implementation-complete-runtime-evidence-pending',
  featureId,
  commitId,
  updatedAt: now,
  evidence: [
    'Rust tests verify electron:server-channel:get-qr-payload serializes the shared QR payload contract.',
    'Tauri Eventa tests verify the server-channel QR invoke maps to electron_server_channel_get_qr_payload.',
    'Stage-tauri Vitest tests verify QR payload JSON serialization, SVG data URL generation, unavailable-state handling, and /settings/connection route selection.',
  ],
  remainingEvidence: [
    'Runtime screenshot of the Tauri settings connection QR card remains pending if cargo tauri dev could not be captured in this CLI session.',
  ],
  runtimeEvidenceStatus: 'pending',
}
fs.writeFileSync(validationPath, `${JSON.stringify(validationDoc, null, 2)}\n`)

const progressEntry = {
  timestamp: now,
  type: 'worker_completed',
  workerSessionId,
  featureId,
  successState: 'implementation-complete-runtime-evidence-pending',
  repoPath: process.cwd(),
  branch,
  commitId,
  verification: [
    'cargo fmt --manifest-path apps/stage-tauri/Cargo.toml --check',
    'cargo test --manifest-path apps/stage-tauri/Cargo.toml server_channel',
    'cargo test --manifest-path apps/stage-tauri/Cargo.toml channel_server',
    'cargo test --manifest-path apps/stage-tauri/Cargo.toml',
    'pnpm -F @proj-airi/tauri-eventa exec vitest run src/tauri/index.test.ts',
    'pnpm -F @proj-airi/tauri-eventa typecheck',
    'pnpm -F @proj-airi/stage-tauri exec vitest run src/settings-connection.test.ts src/window-routes.test.ts',
    'pnpm -F @proj-airi/stage-tauri typecheck',
    'git diff --check',
  ],
  whatWasImplemented: [
    'Returned shared server-channel QR payloads from Rust with ws:// candidate URLs.',
    'Exported server-channel contracts from @proj-airi/tauri-eventa.',
    'Rendered the Tauri settings connection QR card for /settings/connection.',
  ],
  whatWasLeftUndone: [
    'Runtime screenshot evidence remains pending unless captured during this implementation session.',
    'TLS/wss remains deferred with the channel-server-health HTTP-first decision.',
  ],
  notes: [
    'Serena/jcodemunch MCP tools from AGENTS.md were unavailable; native CLI fallback was used.',
    'Known repo postinstall issue remains in @proj-airi/core-terminal declaration output.',
  ],
}
fs.appendFileSync(`${missionDir}/progress_log.jsonl`, `${JSON.stringify(progressEntry)}\n`)
NODE
```

- [ ] **Step 5: Validate mission JSON**

Run:

```bash
jq empty docs/missions/d74b01dc-52da-4992-8a61-ea0a07bd800e/features.json
jq empty docs/missions/d74b01dc-52da-4992-8a61-ea0a07bd800e/validation-state.json
jq empty docs/missions/d74b01dc-52da-4992-8a61-ea0a07bd800e/state.json
jq -c . docs/missions/d74b01dc-52da-4992-8a61-ea0a07bd800e/progress_log.jsonl >/dev/null
```

Expected: all commands exit 0.

- [ ] **Step 6: Commit ledger**

```bash
git add docs/missions/d74b01dc-52da-4992-8a61-ea0a07bd800e/features.json \
  docs/missions/d74b01dc-52da-4992-8a61-ea0a07bd800e/validation-state.json \
  docs/missions/d74b01dc-52da-4992-8a61-ea0a07bd800e/progress_log.jsonl
git commit -m "docs(mission): record channel server qr" \
  -m "Tests: jq empty mission JSON files; jq -c . progress_log.jsonl"
```

- [ ] **Step 7: Final status check**

Run:

```bash
git status --short --branch
git log --oneline -8
```

Expected: branch `vi/feat/channel-server-qr` is clean except for ignored generated files. Latest commits include the task commits and `docs(mission): record channel server qr`.
