# Proactivity Enrichment Roadmap

This document outlines the planned enrichments for AIRI's proactivity system, incorporating initial brainstorming, specific user feedback, and Discord community discussions.

## Phase 1: Core Enhancements (Near-Term)
*Features that are high value, low intrusiveness, and generally considered "safe" sensors.*

### 1. Active Window History ("Rich Context")
*   **Description**: Track the last *X* active windows (configurable) and the duration spent in each.
*   **Logic**: Captures transitions (e.g., *Antigravity (15m) -> Discord (2m) -> Antigravity (5m)*).
*   **Opt-in**: Included in the broad "Inject Event Context" toggle.

### 2. System Load Averages
*   **Description**: Capture CPU, Memory, and GPU load over time (load averages) rather than snapshots.
*   **Opt-in**: Included in broad toggle.

### 3. Voice & TTS Usage Metrics
*   **Description**: Aggregate metrics for voice selection and speech frequency to understand user preferences.
*   **Opt-in**: Base enhancement.

### 4. Interaction Milestones
*   **Description**: AIRI celebrates/acknowledges message counts (e.g., "That's our 500th talk!").
*   **Opt-in**: Base enhancement.

---

## Phase 2: Personalization & Flow
*Features requiring storage updates or user-specific configuration.*

### 5. Interaction Pacing & Latency
*   **Description**: Merged with TTS metrics to understand how "quick" or "slow" the current conversation vibe is.
*   **Requirement**: Time-stamped message logging.

### 6. Temporal & Day Tropes
*   **Description**: Contextual comments for "Taco Tuesday", "Hump Wednesday", etc.
*   **Requirement**: User-facing configuration to control tropical frequencies.

### 7. User Profiles (Birthdays)
*   **Description**: Birthday-aware greetings.
*   **Requirement**: Requires implementation of a persistent user profile/settings store.

---

## Phase 3: Advanced Persistence & Secure Context
*Features that require significant design work or specific secondary opt-ins.*

*   **Emotional Persistence**: Introduce "Invisible Emotion Meters." Tracks cumulative sentiment across sessions (e.g., Trust, Patience, Playfulness) to influence response tone.
*   **Clipboard Metadata (Buffer History)**: **[OPT-IN REQUIRED]** Instead of raw data, AIRI sees a rolling buffer of the last 5 clipboard metadata entries (Mime-type, size, source app if available). This provides a "breadcrumb trail" of user intent (e.g., copying a URL -> copying a file path -> copying a code snippet).
*   **Physical Model Tracking**: Lightweight logging of mouse/click interactions mapped to VRM bones or Live2D hit areas to enrich "physicality" commentary.

---

### Phase 3: Sample Payloads

**Clipboard Metadata (Rolling History):**
```text
Clip History (Last 5):
1. [URL/text/uri-list] [152b] [Browser]
2. [FilePath/text/plain] [84b] [Explorer]
3. [Binary/image/png] [1.2mb] [Snippet Tool]
4. [Code/text/plain] [450b] [VS Code]
5. [Text/plain] [12b] [Terminal]
```
*   **Security**: Pre-calculates indices locally; LLM never sees the sensitive raw strings (passwords, etc.).
*   **Opt-in**: **Specific Sub-Toggle Required**.

---

## UI / Configuration Strategy

### Broad Opt-in: "Inject Event Context"
Currently labeled as "Inject event context into prompt" with the sub-text "provide sensor data". This will act as the master switch for:
*   Local Time / Day of week
*   Battery Status
*   Load Averages
*   Active Window History

### Specific Opt-ins (Checkboxes)
Features that require explicit, specialized user consent:
*   **Media Now Playing**: Commentary on currently playing tracks.
*   **Clipboard Metadata**: Analyzing clipboard patterns without raw text.
*   **Aggressive Heartbeats**: Overriding the "Require Keyboard/Mouse Inactivity" gate.

---

## UI Implementation & Transparency

To provide transparency and "peace of mind," each sensor will feature a circular info icon `(?)` that reveals a **Sample Payload** when hovered. This is the exact text appended to the "Situational Context" section of the LLM prompt.

### Main Toggle Refinement
*   **Proposed Label**: **Enrich Proactive Context**
*   **Proposed Sub-text**: *Appends non-identifying situational sensors (load, activity history, system state) to heartbeat prompts for more relevant AI commentary.*

### Phase 1 Tooltip Samples ( (?) Hover )

| Sensor | Tooltip Description | Sample Prompt Payload (Template Format) |
| :--- | :--- | :--- |
| **Window History** | Recent active apps with duration and time range. | `[ VS Code ] [ 15m ] [ 10:45 - 11:00 ]`<br>`[ Spotify ] [ 3m ] [ 11:00 - 11:03 ]` |
| **Load Averages** | CPU & Multi-GPU resource load over time. | `CPU Load (1/5/15): 0.5 | 0.72 | 0.61`<br>`GPU Load (Avg): 0.45` |
| **Usage Metrics** | Hourly interaction statistics (TTS, STT, Chat). | `TTS (Last Hr): 5`<br>`STT (Last Hr): 0`<br>`Chat (Last Hr): 2` |
| **Milestones** | Total interaction counts and next target. | `Turn Count: 498 (Next Target: 500)` |

---

## Discarded Ideas (Community & Internal Vetting)
*   **Network Status / Lag**: Dropped due to testing complexity and environment-specific firewall issues.
*   **Raw Clipboard History**: Dropped for security; replaced by **Clipboard Metadata**.
*   **System Theme**: Too low impact; users rarely switch themes mid-session.
*   **Feature Discovery**: Too vague/scaffold-heavy.
*   **File Monitoring**: Dropped to avoid per-app implementation nightmares.

## Implementation Plan

### Phase 1: Core Enhancements

| Component | Target File | Action |
| :--- | :--- | :--- |
| **Shared Contracts** | [sensors.ts](file:///c:/Users/h4rdc/Documents/Github/airi-rebase-scratch/packages/stage-shared/src/sensors.ts) | Add `SystemLoadAverages` and `ActiveWindowHistory` interfaces. |
| **Electron Main** | [sensors/index.ts](file:///c:/Users/h4rdc/Documents/Github/airi-rebase-scratch/apps/stage-tamagotchi/src/main/services/sensors/index.ts) | Implement `sensorsGetSystemLoad` and logic for tracking active window history. |
| **Proactivity Store** | [proactivity.ts](file:///c:/Users/h4rdc/Documents/Github/airi-rebase-scratch/packages/stage-ui/src/stores/proactivity.ts) | Implement hourly counters (TTS/STT/Chat), milestone tracking, and the prompt injection formatter. |
| **TTS Counting** | [speech.ts](file:///c:/Users/h4rdc/Documents/Github/airi-rebase-scratch/packages/stage-ui/src/stores/modules/speech.ts) | Increment `ttsCount` within the `speech` action. |
| **STT Counting** | [hearing.ts](file:///c:/Users/h4rdc/Documents/Github/airi-rebase-scratch/packages/stage-ui/src/stores/modules/hearing.ts) | Increment `sttCount` within the `transcription` action. |
| **Chat Counting** | [chat.ts](file:///c:/Users/h4rdc/Documents/Github/airi-rebase-scratch/packages/stage-ui/src/stores/chat.ts) | Increment `chatCount` within `performSend`. |
| **UI Settings** | [CardCreationDialog.vue](file:///c:/Users/h4rdc/Documents/Github/airi-rebase-scratch/packages/stage-pages/src/pages/settings/airi-card/components/CardCreationDialog.vue) | Refine labels/sub-text and add Circular `(?)` tooltips with sample payloads. |

## Verification Plan

### Manual Verification
1. **Sensor Accuracy:** Hover over the circular `(?)` in settings to verify the sample payload matches the expected template format with live data.
2. **Counter Persistence:** Perform 5 chat messages, 2 TTS generations, and 1 STT transcription. Verify the payload tooltip reflects `Chat (Last Hr): 5`, `TTS (Last Hr): 2`, `STT (Last Hr): 1`.
3. **Milestone Trigger:** Set a low milestone (e.g., 5 turns) and verify the payload reflects the target.
4. **Active Window History:** Switch between 3 different applications for 1 minute each, then check if the history payload correctly lists them with durations.
