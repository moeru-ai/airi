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

### 2. DiT-Generated PNGs with Transparency
Diffusion Transformers (DiT) like SD3 or specialized object generation models can potentially output transparency.
- **Native Alpha**: Some newer DiT architectures can be trained for RGBA output.
- **Post-Processing (RMBG)**: Integrate Background Removal (e.g., RMBG-1.4 or BRIA AI) as a post-generation step to create transparent "assets" (furniture, props) for the scene.
- **API Idea**: `generate_asset(prompt: "a cozy green armchair", transparent: true)` returns a PNG with alpha.

---

## Proposed Technical Roadmap

### Phase 1: Background Manager
- [ ] Create a `sceneStore` to manage active background images (blob URLs).
- [ ] Implement a basic background layer in `Stage.vue` that sits behind the model canvases.
- [ ] Update the Scenes settings to allow uploading/selecting these images.

### Phase 2: Primitive Physics/Walls
- [ ] Extend the `index.vue` "wall" concept into a generic component.
- [ ] Allow defining "ground" and "wall" lines that the character's `y-offset` can respect.

### Phase 3: AI-Generated Scenes
- [ ] Integrate a `generateScene` tool that can produce backgrounds.
- [ ] Research DiT implementations for transparent object generation to allow "decorating" the scene.
