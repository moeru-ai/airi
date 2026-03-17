# Feature Brainstorming: [New Feature Name]

## Concept Overview
Allow users to dynamically select the default idle animation for VRM models via a global setting. This replaces the currently hardcoded `idle_loop.vrma`.

## Motivation
Currently, all VRMs share the same hardcoded idle animation (`idle_loop.vrma`). Providing a way to customize this (and potentially use other animations from the assets folder or a user-specified path) significantly increases personalization.

## Proposed Resolution

### Phase 1: MVP - Customizable Global Idle Animation (Built-in Presets)
- **Goal**: Allow users to select from the 11 built-in `.vrma` presets.
- **Storage**: Add `vrmIdleAnimation` to the `useSettingsStageModel` store (persisted in LocalStorage). Default to `idle_loop`.
- **UI**: Add a "Default Idle Animation" dropdown in the Model Settings -> VRM panel.
- **Wiring**: Update `Stage.vue` to bind the `ThreeScene` `idle-animation` prop to the new store value.
- **Reloading**: Update `VRMModel.vue` to watch for `idleAnimation` changes and trigger a reload.

### Phase 2: ACT Token Integration
- **Goal**: Enable AI to trigger animations on demand.
- **Mechanism**: Integrate with `specialTokenQueue`. Allow `<|ACT:{"animation":"crab_dance"}|>` to trigger any built-in animation.
- **Transiton**: Ensure "smooth as butter" transitions between the idle loop and on-demand animations.

### Phase 3: User Storage Integration
- **Goal**: Allow users to drop their own `.vrma` files into storage.
- **Storage**: Utilize origin-isolated folders in IndexedDB/OPFS as described in `Storage-Architecture.md`.
- **Discovery**: Automatically scan the storage directory for new `.vrma` files and add them to the selection dropdown.

## Phase 2 Pitch: ACT Token Integration (REFINED)

Based on the criteria: **Seamless, Optional, and Prioritized**.

### 1. Seamless (The "Butter" Logic)
- **Automatic Trigger**: Hook into `specialTokenQueue` (via `Stage.vue`). When an `<|ACT|>` token is parsed, we first check if the `emotion.name` (or a potential new `motion` field) matches one of our 10 VRMA animation keys.
- **Auto-Return**: Animations triggered this way will play and then smoothly cross-fade back to the **Phase 1 Global Default Idle** upon completion (or after a fixed duration).

### 2. Optional (The Acting Tab)
- **UI Helper**: In the **Acting** tab of the AIRI Card editor, we will add a new section: **"Available Idle Animations"**.
- **Manual "Teaching"**: This section will list buttons for `agent007`, `blingBang`, etc. Clicking them will insert the corresponding ACT token into the prompt. If the user doesn't add them, AIRI won't know they exist (keeping it optional).

### 3. Prioritized (The Hierarchy)
- **VRMA vs. Expression**: If a token name exists as both a VRMA animation and a blendshape expression, the **VRMA animation takes precedence**.
- **Execution flow**:
  1. Check if name is a VRMA Animation preset -> **Play VRMA**.
  2. If not, check if name is a Model Expression -> **Apply Expression**.
  3. If not, fallback to existing behavior.

### 4. Technical Mapping
- **ACT Payload**: We'll enhance `queues.ts` to better handle both `emotion` and the `motion` fields in ACT tokens.
- **Animation Hub**: Use the `animations` export from `stage-ui-three` as the source of truth for both the UI helpers and the Stage hook.

## Decision Log
- **Per-Character Settings**: **REJECTED**. The feature will remain global to keep complexity low and value high.
- **Phasing**: Transitioning from built-in presets to dynamic user storage in clearly defined stages.

## Technical Implementation Plan (Phase 1)

### 1. Asset Exports
**File**: [animations/index.ts](file:///c:/Users/h4rdc/Documents/Github/airi-rebase-scratch/packages/stage-ui-three/src/assets/vrm/animations/index.ts)
- Currently only exports `idleLoop`.
- **Change**: Export all 11 `.vrma` files (e.g., `crab_dance`, `peace_sign`, etc.) as named constants.

### 2. State Management
**File**: [model-store.ts](file:///c:/Users/h4rdc/Documents/Github/airi-rebase-scratch/packages/stage-ui-three/src/stores/model-store.ts)
- **Change**: Add `vrmIdleAnimation` (string) to `useModelStore`.
- **Default**: `'idleLoop'` (mapped to `idle_loop.vrma`).
- This ensures the setting is persisted via `useLocalStorage`.

### 3. Component Propagation
**File**: [Stage.vue](file:///c:/Users/h4rdc/Documents/Github/airi-rebase-scratch/packages/stage-ui/src/components/scenes/Stage.vue)
- **Change**: Bind `vrmIdleAnimation` from the store to the `idle-animation` prop of `ThreeScene`.

### 4. Animation Loading Logic
**File**: [VRMModel.vue](file:///c:/Users/h4rdc/Documents/Github/airi-rebase-scratch/packages/stage-ui-three/src/components/Model/VRMModel.vue)
- **Change**: Add a watcher for the `idleAnimation` prop.
- **Logic**: When changed, load the new `.vrma`, strip facial expression tracks (to avoid overriding the expression system), and update the mixer.
- **Transition**: Use `AnimationAction.crossFadeTo` or similar for "smooth as butter" transitions.

### 5. Settings UI
**File**: [vrm.vue](file:///c:/Users/h4rdc/Documents/Github/airi-rebase-scratch/packages/stage-ui/src/components/scenarios/settings/model-settings/vrm.vue)
- **Change**: Add a dropdown menu for "Default Idle Animation".
- **Options**: Populated from the exported animation keys in `stage-ui-three`.
