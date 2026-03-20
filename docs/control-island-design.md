# Control Island Design Catalog

The Control Island is a floating UI component designed for the AIRI desktop environment (stage-tamagotchi). It follows an iOS-style "island" or "drawer" pattern, providing quick access to essential controls and settings.

## Component Location
- **Main Component**: `apps/stage-tamagotchi/src/renderer/components/stage-islands/controls-island/index.vue`
- **Store**: `packages/stage-ui/src/stores/settings/controls-island.ts` (Shared settings)
- **Renderer Store**: `apps/stage-tamagotchi/src/renderer/stores/controls-island.ts` (Renderer-specific state like `fadeOnHoverEnabled`)

## Layout & Interaction
- Located at the **bottom-right** of the screen.
- Collapsed by default, showing only the expand/collapse trigger and a drag handle.
- Uses `@proj-airi/electron-vueuse` for window interaction (dragging, mouse transparency, always-on-top).
- Supports "Fade on Hover" to prevent obscuring the model when handled by the user.

## Button Set Catalog

### 1. Persistent Controls (Always Visible)
| Feature | Icon / Indicator | Behavior |
| :--- | :--- | :--- |
| **Expand/Collapse** | `i-solar:alt-arrow-up-line-duotone` | Toggles the drawer panel. Rotates 180° when expanded. |
| **Drag Handle** | `i-ph:arrows-out-cardinal` | Allows moving the Electron window. Pulses red during STT processing. |

### 2. Drawer Panel - Main View
| Action | Icon | Detail |
| :--- | :--- | :--- |
| **Settings** | `i-solar:settings-minimalistic-outline` | Opens the main settings window/page. |
| **Profile Picker** | `i-solar:emoji-funny-square-broken` | Opens a popover to switch between different AI souls/profiles. |
| **Chat** | `i-solar:chat-line-line-duotone` | Opens the chat interface. |
| **Refresh** | `i-solar:refresh-linear` | Reloads the renderer window (useful for debugging or reset). |
| **Dark Mode** | `i-solar:moon-outline` / `sun-2` | Toggles between system dark and light themes. |
| **Hearing** | `IndicatorMicVolume` / `mic-slash` | Toggles microphone and opens hearing configuration. |
| **Always on Top** | `i-solar:pin-bold` / `pin-linear` | Toggles window "Always on Top" state. |
| **Fade on Hover** | (Custom Component) | Toggles the UI's transparency behavior when the mouse is over the model. |
| **Emotions** | `i-solar:emoji-funny-square-outline` | Switches the island view to the Emotions sub-menu. |
| **Favorite** | `i-solar:star-bold` / `star-linear` | Toggles a user-defined "favorite" expression. Highlights when active. |
| **Cycle Animation**| `i-solar:running-2-linear` | Cycles through available VRM animations (Idle loops). |
| **Close** | `i-solar:close-circle-outline` | Closes the application/window. |

### 3. Drawer Panel - Emotions View
| Emotion | Emoji | Action |
| :--- | :--- | :--- |
| **Happy** | 😊 | Triggers "happy" expression. |
| **Sad** | 😢 | Triggers "sad" expression. |
| **Angry** | 😠 | Triggers "angry" expression. |
| **Surprised** | 😲 | Triggers "surprised" expression. |
| **Neutral** | 😐 | Triggers "neutral" expression. |
| **Think** | 🤔 | Triggers "think" expression. |
| **Cool** | 😎 | Triggers "cool" expression. |
| **Random** | `i-solar:shuffle-linear` | Triggers a random emotion from the list. |
| **Back** | `i-solar:arrow-left-outline`| Returns to the Main View. |

## Visual Design Details
- **Styling**: Uses UnoCSS for utility-first styling.
- **Glassmorphism**: Uses `backdrop-blur-xl` and semi-transparent backgrounds (`bg-neutral-100/80` / `bg-neutral-900/80`).
- **Animations**: Uses Vue transitions with cubic-bezier easing for a premium feel.
- **Icon Set**: Primarily uses `Solar` and `Phosphor` (via Iconify).

---

# Adjacent Stage Components

While the Control Island is the primary interaction hub, several other "island-style" or overlay components exist within the Stage view to provide feedback and status.

## 1. Resource Status Island
- **Location**: Top-center (`top-3`).
- **Component**: `apps/stage-tamagotchi/src/renderer/components/stage-islands/resource-status-island/index.vue`
- **Purpose**: Provides a floating indicator for resource loading (models, plugins, etc.).
- **Behavior**:
    - Appears after a delay (5s-10s) if resources are still loading.
    - Shows a pulsing ring (`i-svg-spinners:pulse-ring`) during active loading.
    - Displays a "Ready!" status with a checkmark (`i-solar:check-circle-bold-duotone`) when finished.
    - Expandable: Clicking opens a detailed list of modules and their loading states.

## 2. Transcription Feedback (STT Toast)
- **Location**: Managed by `vue-sonner` (bottom-right by default, overlaying the Stage).
- **Trigger**: `apps/stage-tamagotchi/src/renderer/pages/index.vue` via `toast.info()`.
- **Purpose**: Provides immediate visual confirmation of what the user said during voice interaction.
- **Visuals**:
    - **Message**: `🎤 You said: {text}`
    - **ID**: `transcription-feedback` (prevents toast spam by updating the same entry).
    - **Style**: Matches the system toast theme but is positioned to be non-intrusive while remaining readable over the 3D/Live2D model.

## 3. Interaction Feedback (Toasts)
To provide immediate visual confirmation for Control Island actions, the following events trigger a toast in the `transcription-feedback` slot:

| Event | Toast Message |
| :--- | :--- |
| **Emotion Triggered** | `Triggered {emotion} expression` |
| **Random Emotion** | `Triggered {random_emotion} expression` |
| **Animation Cycled** | `Selected animation: {animationName}` |
| **Profile Switched** | `You selected AIRI Card: {cardName}` |

These toasts ensure the user knows their interaction was successful, even if the model's visual response is subtle.
