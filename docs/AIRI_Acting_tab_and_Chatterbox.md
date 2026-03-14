# Systems Design Document: AIRI "Acting" Engine & TTS Preset Architecture

## 1. System Overview
This architecture extends your existing `server.py` (Chatterbox OpenAI-compatible server) to support dynamic preset resolution and AIRI's new **Acting** tab.

Currently, `server.py` relies on a global `--mannerisms` CLI argument. The new architecture shifts this to dynamic, per-request resolution based on the `voice` string requested by AIRI, decoupling prompt management into a dedicated UI layer.

---

## 2. The Data Model: Presets vs. Profiles
To accurately reflect your system, we must separate **Profiles** (text transformation logic) from **Presets** (the virtual voice pack).

**A. `profiles.json` (Unchanged)**
Contains the raw regex and substitution logic for text transformations.
*(e.g., `catgirl`, `wired_goddess`, `demon_imp`)*

**B. The New Preset Object (e.g., `presets.json`)**
This is what the Chatterbox Provider UI constructs. It binds a base voice file to a mannerism profile and UI capabilities.
```json
{
  "preset_lain": {
    "voice_file": "lain", // Maps to resolve_voice_path() -> voices/lain.mp3
    "tts_model": "full", // "full" or "turbo"
    "exaggeration": 0.0, // Used in model.generate() if model != turbo
    "mannerism_profile": "wired_goddess", // Key referencing profiles.json
    "ui_expressions": ["[whisper]", "[sigh]", "[gasp]", "[exhale]"], // Populates Acting Tab
    "ui_mannerisms": ["~", "0_0"] // Populates Acting Tab
  }
}
```

---

## 3. Backend Architecture & Compatibility (`server.py` modifications)

**1. The `GET /v1/voices` Endpoint**
The server will return a merged list:
*   **Native Voices:** Scanned dynamically from the `voices/` directory (e.g., `ivy`, `kappa`, `lain`).
*   **Virtual Voices:** Loaded from the saved presets (e.g., `preset_lain`, `preset_catgirl`).

**2. The `POST /v1/audio/speech` Endpoint (Dynamic Resolution)**
Instead of relying on the global `ACTIVE_PROFILE_NAME`, the endpoint dynamically resolves the `request.voice` parameter:
*   **Check ID:** If `request.voice == "preset_lain"`.
*   **Load Preset:** Fetch the JSON object defined above.
*   **Execute `preprocess_text`:** Pass the input text and `mannerism_profile` ("wired_goddess") into your existing text normalizer to handle tildes, emoticons, and Hmph regexes.
*   **Resolve Audio Path:** Pass `voice_file` ("lain") into `resolve_voice_path()`.
*   **Synthesize:** Call `model.generate()` applying the preset's specific `exaggeration` parameter (if not using turbo).

---

## 4. Provider Settings: Chatterbox Management Studio
Located in AIRI under `Settings -> Providers -> Speech -> Chatterbox`.

**Panel 1: System Capabilities**
*   Hits `GET /chatterbox/capabilities` (a new endpoint you'll add to `server.py`).
*   Returns available voice files from `/voices`, available profiles from `profiles.json`, and TTS modes.

**Panel 2: Preset Builder**
*   **Preset Name:** (e.g., `preset_lain`)
*   **Base Voice:** Dropdown of native voices (e.g., `lain`).
*   **Mannerism Profile:** Dropdown of keys from `profiles.json` (e.g., `wired_goddess`).
*   **TTS Settings:** Toggle for Turbo mode, Slider for Exaggeration.
*   **Supported Expressions:** Checkboxes of valid Chatterbox tags (e.g., `[sigh]`, `[whisper]`) to expose to the character.

---

## 5. Character Configuration: The "Acting" Tab
Located at `Settings -> AIRI Card -> Edit -> Acting`.

This tab dynamically generates the semantic instructions that tell the LLM *how* to perform, bridging the gap between text generation and your `preprocess_text` engine.

### A. Avatar / Model Acting (VRM/Live2D)
*   **Available Expressions:** Fetches from the loaded VRM model (e.g., `[happy]`, `[pixel_glasses]`).
*   **Textarea Prompt:** Auto-generates the system prompt instructing the model to use these tags to puppet the avatar.

### B. Voice / TTS Expressions
*   **Active Voice:** `preset_lain` (Resolved to Chatterbox provider).
*   **Available Tags:** Displays the `ui_expressions` saved in the preset (e.g., `[whisper]`, `[sigh]`).
*   **Textarea Prompt:**
    ```text
    You may enhance dialogue with vocal expressions.
    Supported vocal tags: [whisper], [sigh], [gasp].
    ```

### C. Textual Mannerisms
*   **Active Voice:** `preset_lain`
*   **Available Hooks:** Displays the `ui_mannerisms` saved in the preset (e.g., `~`, `0_0`).
*   **Textarea Prompt:**
    ```text
    Your speech style includes unconscious textual mannerisms.
    Examples: ~, 0_0.
    Use them naturally without calling attention to them.
    ```

---

## 6. The End-to-End Semantic Pipeline (Execution Flow)

1.  **Prompt Injection:** AIRI injects the textareas from the **Acting** tab into the system prompt.
2.  **LLM Generation:** The model understands the rules and outputs:
    *   `<|ACT:"emotion":{"name":"Surprised"}|> 0_0 [gasp] You can see my true form~`
3.  **AIRI Parsing:**
    *   AIRI triggers the VRM `Surprised` animation via the ACT token.
    *   AIRI sends the remaining string to your `server.py`: `0_0 [gasp] You can see my true form~`
4.  **Chatterbox `preprocess_text()` (The Magic):**
    *   `preset_lain` maps to the `wired_goddess` profile.
    *   `0_0` is replaced via emoticon regex with `[gasp]`.
    *   `~` is replaced via tilde array with `.. desu`.
    *   *Resulting String:* `[gasp] [gasp] You can see my true form.. desu.`
5.  **Audio Generation:** `server.py` generates the audio using `lain.mp3`, the resolved parameters, and the fully formatted text.
