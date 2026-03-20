# Scenes System Research

Documentation and research for the "Scenes" feature in AIRI, transitioning from static backgrounds to a functional 2D world.

## Current State

### 1. Placeholder & UI
- **Settings Page**: `packages/stage-pages/src/pages/settings/scene/index.vue` is a placeholder with a "needs your help" callout.
- **Model Viewer Scene**: `packages/stage-ui/src/components/scenarios/settings/model-settings/vrm.vue` contains robust positioning and lighting controls (X/Y/Z position, FOV, Lights, SkyBox).

### 2. Transparency-Aware Rendering
- **Live2D**: `packages/stage-ui-live2d/src/components/scenes/live2d/Canvas.vue` uses PixiJS with `backgroundAlpha: 0`.
- **VRM**: `packages/stage-ui-three/src/components/ThreeScene.vue` uses TresJS (Three.js) with `:alpha="true"` and `:clear-alpha="0"`.
- **Implication**: Both renderers are "transparent" by default, meaning they can layer on top of any DOM-based background or other canvases.

### 3. "Wall" Prototype
- **Desktop (Tamagotchi)**: `apps/stage-tamagotchi/src/renderer/pages/index.vue` implements a "wall" concept using CSS gradients and animations to demarcate the "DRAG HERE TO MOVE" region.
- **Visuals**: Striped animated borders at the top and bottom of the interactive area.

---

## Research Directions

### 1. Functional "2D World" (Decoupled Architecture)
Instead of tying 2D environments to specific characters, a "Scene" should be a top-level entity. This allows for:
- **Shared Environments**: Multiple characters can be placed in the same room/scene without duplicating configuration.
- **Scene-Specific Properties**: Collision boundaries (walls), lighting, and interactive objects (props) belong to the Scene itself.
- **Model-Independent Persistence**: Backgrounds and world-rules persist even if the user switches characters.

### 2. Physical Interaction & Depth
A Scene in AIRI represents an environment with:
- **Collision Boundaries (Walls)**: Providing structural limits for model movement.
- **Dynamic Z-Depth**: Grouping objects into foreground, middle-ground (character), and background layers.
- **Interactive Objects**: AI-aware props (e.g., "The cat is on the couch").

## UI & Token Interaction Design

### 1. Proposed UI Integration (AIRI Card Editor)
To support character-specific environments, we should add a **Scene** tab to the `CardCreationDialog`:
- **Selective Override**: A toggle to "Use Character-Specific Background".
- **Asset Manager**: A simplified version of the main Scenes UI, allowing one active background to be uploaded/selected for that specific character.
- **Portability**: When the character is exported as a PNG (AIRI Card), the background blob is Base64 encoded and injected into the PNG metadata under a `scene_background` key.

### 2. Token Logic (ACT vs. SCENE)
Discussing the differentiation between behavior and environment:
- **`ACT` Token**: Best suited for *Internal State* (emotions, expressions) and *Micro-Motions* (gestures, poses).
    - Example: `<|ACT:"emotion":{"name": "excited"},"motion":"wave"|>`
- **`SCENE` Token**: Recommended for *External State* (background flips, lighting changes, ambience).
    - Example: `<|SCENE:{"background": "park.png", "ambience": "birds_chirping"}|>`
- **Rationale**: Decoupling allows for scene changes without forcing a behavior shift, and vice versa. It also keeps the JSON payload for each token type concise and focused.

### 3. "Special Sauce" Post-Processing
For AI-generated scenes, we propose a pipeline:
1.  **Generation**: DiT produces a raw background.
2.  **Segmentation**: Run a segmentation model (e.g., SAM - Segment Anything) to identify the "floor" and "walls".
3.  **Refinement**: If the character is partially "in" the scene (e.g., sitting on a couch), use the segmentation mask to create a "Foreground Prop" layer that sits in front of the character's canvas.

### 2. Autonomous Environment Control
The AI (AIRI) should have the agency to modify her own environment:
- **Self-Updating Backgrounds**: Based on conversation context (e.g., "Let's go to the park"), AIRI triggers a scene change.
- **ACT Token Evolution**: Re-evaluating if `<|ACT...|>` is the right vehicle for scene control. While "acting" often involves a setting, we may need a dedicated `<|SCENE:{"background": "..."}|>` or similar for explicit environment flips.

### 3. Character-Specific vs. Global Scenes
A hybrid approach to character-scene integration:
- **Global Library**: Users upload scenes to a main repository (current Phase 1).
- **Character Overrides**: AIRI cards can specify a "Preferred Scene" ID.
- **Exclusive Scenes**: Option to tie a specific background *only* to one character.

### 4. AIRI Card Persistence (The "Blob in PNG" Idea)
To ensure portability, we should leverage the PNG metadata of AIRI cards:
- **Embedded Assets**: Base64 encode the active background blob directly into the character's PNG file.
- **Re-import Flow**: When a user shares a card, importing it automatically restores the character's preferred environment.

---

## Proposed Technical Roadmap

### Phase 1: Background Manager (Complete)
- [x] Global `sceneStore` and background layer in `Stage.vue`.
- [x] Settings UI for manual image management.

### Phase 2: Primitive Physics/Walls
- [ ] Allow defining "ground" and "wall" lines that the character's `y-offset` can respect.

### Phase 3: AI-Generated Scenes
- [ ] Integrate a `generateScene` tool that can produce backgrounds.
- [ ] Research DiT implementations for transparent object generation to allow "decorating" the scene.
