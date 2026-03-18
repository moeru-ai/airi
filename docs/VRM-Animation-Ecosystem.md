# VRM Animation Ecosystem

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
### Phase 3a: The "Idle Hairball" (Global Random Cycle)
- **Goal**: Move beyond a single static idle loop to a dynamic resting state.
- **Scope**: A global toggle that, when enabled, samples a random animation from the preset library and cross-fades between them.
- **Integration**: Must gracefully yield to `<|ACT|>` performance tokens and resume upon completion.

### Phase 3b: Per-Character "Persona Palettes"
- **Goal**: Allow fine-grained control over which animations are allowed for specific characters.
- **UI**: Added to the AIRI Card "Acting" or "Motion" tab.
- **Override**: If configured, the per-character list overrides the global random pool.

### Phase 4: User Storage Integration
- **Goal**: Allow users to upload and manage their own `.vrma` files.
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

## Phase 3a: The "Idle Hairball" Concept (REFINED SCOPE)
- **Goal**: Ensure the character feels "alive" and use constant animation switching as a stability stress-test for the VRM mixer.
- **Mechanism**: A boolean `vrmIdleCycleEnabled` in the model store.
- **Logic**:
  1. **Sampling**: When one loop finishes, pick a new random index from the 24 presets.
  2. **Transition**: Cross-fade between states to avoid "snapping."
  3. **Interruption Handling**: If an `<|ACT|>` performance token is triggered, the cycle pauses, yields to the performance, and then resumes a new idle cycle once finished.

## Deep Dive: The VRMA Customization Ecosystem & User Empowerment

### 1. The Per-Character vs. Global Question
- **Hierarchy**: Do we keep a global "default" for all models, or move to a per-character "Persona Palette"?
- **UI Placement**: If per-character, does this live in the **Acting** tab or a new **Motion** tab?
- **Granularity**: Users should have "Fine-tune Control"—the ability to pick-and-choose which animations are allowed for a specific character (e.g., Lain gets geometric/stilted poses, whereas someone else gets high-energy dances).

### 2. User-Customizable VRMAs (The "Uploader" Flow)
- **Moving away from `index.ts` Hacks**: We need a first-class uploader.
- **Location**: Place the uploader UI right next to the VRM/Live2D model selector to signify that VRMAs are "first-class" support models.
- **Workflow**:
  - User clicks "Add VRMA".
  - File picker opens -> User selects `.vrma`.
  - System prompts for a name (defaulting to clean filename).
  - File is stored in IndexedDB/OPFS (Private Storage).
- **Discovery**: The **Explore** tab should have a dedicated category for VRMAs to help users find and enrich their library.

### 3. Key Resources & Marketplaces
- **Finding VRMAs**: [Booth.pm - VRM Animation Marketplace](https://booth.pm/en/browse/3D%20Motion%20&%20Animation?sort=price_asc&tags%5B%5D=VRMA)
- **Guides**: [Vidol Chat - How to get VRMA](https://docs.vidol.chat/en/role-manual/faq/how-to-get-vrma)

### 4. Open UI/UX Questions
- If global, is it "all-or-one" or a "checked selection"?
- How do we visualize the "sampling" state in the UI so the user knows *why* she just switched animations?
- Interaction with ACT tokens: If a performance is playing, do we show a "Performance in Progress" lockout in the settings?
