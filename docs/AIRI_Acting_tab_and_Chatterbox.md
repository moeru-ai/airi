# Systems Design Document: AIRI Acting Tab and Chatterbox Integration

## 1. Current Status

This document reflects the current fork state and the intended design direction.

### Already Implemented

**Chatterbox Provider**
- AIRI has a first-class `chatterbox` speech provider.
- AIRI has a dedicated Chatterbox management studio under `Settings -> Providers -> Speech -> Chatterbox`.
- The studio supports preset and profile CRUD.
- Chatterbox server persistence is live and saves to `presets.json` and `profiles.json`.

**Chatterbox Backend**
- `GET /v1/voices` returns merged native and virtual voices.
- `GET /chatterbox/capabilities` exists.
- Preset CRUD exists.
- Profile CRUD exists.
- Dynamic preset resolution in `POST /v1/audio/speech` exists.

### Not Implemented Yet

**AIRI Acting Tab**
- The AIRI Card `Acting` tab does not exist yet as a real editing surface.
- AIRI does not yet expose model acting helpers, speech-expression helpers, or speech-mannerism helpers in the card editor.
- AIRI does not yet inject dedicated Acting-tab prompt fields into the system prompt builder as separate first-class inputs.

This means the Chatterbox platform side is mostly complete. The missing frontier is the AIRI-side authoring and prompt-helper experience.

---

## 2. Core Design Principle

The Acting tab must stay both backward-compatible and forward-compatible.

That means AIRI should **not** collapse these concepts into one thing:

- raw voice / synthesis source
- speech preset
- freeform prompt instructions

They may be related, but they are not the same data.

### The Compatibility Rule

**Prompt fields are prompt-builder inputs, not provider state mirrors.**

So:
- AIRI prompt boxes stay open-ended and user-authored.
- Provider capabilities can power helper UI beneath those prompt boxes.
- The helper UI should assist composition, not own the prompt text.

This keeps the design flexible for:
- Chatterbox
- Grok-style providers with speech tags
- future engines like `fish`
- older cards that only contain freeform prompt text

---

## 3. Data Model: Separate the Layers

The system should treat the following as distinct layers.

### A. Base Voice

This is the raw synthesis source.

Examples:
- `lain`
- `lain2`
- `lain3`

This is closest to a true provider voice or audio file.

### B. Speech Preset

This is a provider-side rendering preset.

Examples:
- `lain_acting`
- `preset_lain`

A speech preset may reference:
- base voice
- model mode
- exaggeration
- profile/mannerism data
- helper metadata exposed to AIRI

But it is **not** the same thing as the base voice.

### C. Prompt Builder Fields

These are AIRI-authored instruction fields used to build the final system prompt.

They are open-ended and do not need strict two-way synchronization with provider config.

Examples:
- character core / personality
- speaking style
- ACT token instructions
- speech tag guidance
- mannerism guidance
- widget / artistry behavior

This is where the Acting tab lives.

---

## 4. Chatterbox Data Model

### A. `profiles.json`

Contains the raw text transformation logic.

Examples:
- `catgirl`
- `wired_goddess`
- `demon_imp`

These are implementation-side transformation profiles.

### B. `presets.json`

Contains virtual speech presets assembled in the Chatterbox studio.

Example shape:

```json
{
  "preset_lain": {
    "voice_file": "lain",
    "tts_model": "full",
    "exaggeration": 0.0,
    "mannerism_profile": "wired_goddess",
    "ui_expressions": ["[whisper]", "[sigh]", "[gasp]", "[exhale]"],
    "ui_mannerisms": ["tilde", "eyes", "hmph"]
  }
}
```

Important:
- `voice_file` is the base voice
- the preset is the higher-level reusable speech configuration
- `ui_expressions` and `ui_mannerisms` are helper metadata for AIRI authoring

---

## 5. Provider Capability Model

To avoid hardcoding the Acting tab to Chatterbox alone, AIRI should think in terms of provider capabilities.

Examples:
- `supportsSpeechTags`
- `availableSpeechTags`
- `supportsSpeechMannerisms`
- `availableSpeechMannerisms`
- `supportsPresets`
- `availableSpeechPresets`

This allows:
- Chatterbox to participate
- Grok-like providers with supported tags to participate
- future Chatterbox-compatible forks like `fish` to participate

So the Acting tab should ask:

1. What model-side acting capabilities exist?
2. What speech-provider expression capabilities exist?
3. What speech-provider mannerism capabilities exist?

Then expose helper UI accordingly.

---

## 5.1 Capability Endpoint Direction

For Chatterbox-compatible engines, AIRI should not maintain the supported tag list in client code as the source of truth.

Instead:
- the server remains authoritative
- AIRI consumes normalized capability data
- the existing `/chatterbox/capabilities` endpoint is the correct place to expand

This means we do **not** need a separate tags endpoint right now.

The existing capabilities payload should evolve from:

```json
{
  "voices": ["ivy", "lain"],
  "profiles": ["wired_goddess"],
  "modes": ["full", "turbo"]
}
```

into something more like:

```json
{
  "voices": ["ivy", "lain"],
  "profiles": ["wired_goddess"],
  "modes": ["full", "turbo"],
  "speech": {
    "supportsPresets": true,
    "supportsExpressionTags": true,
    "supportsMannerisms": true,
    "expressionTags": [
      {
        "category": "emotion",
        "tag": "happy",
        "description": "Expresses happiness or joy"
      }
    ],
    "mannerisms": [
      { "id": "tilde", "label": "Tilde" },
      { "id": "eyes", "label": "Emoticon Replacements" },
      { "id": "hmph", "label": "Hmph Variants" }
    ]
  }
}
```

This gives AIRI enough information to build:
- grouped tag helper UI
- mannerism helper UI
- future preset-aware helper flows

---

## 5.2 `supported_tags.csv` as the Server Source of Truth

For engines with large tag sets, like `fish`, the server should load supported tags from a flat file in the project root.

Recommended CSV format:

```csv
category,tag,description
emotion,happy,Expresses happiness or joy
prosody,pause,Insert a timed break
sound,inhale,Audible intake of breath
```

This format is better than a flat `id,label,description` list because:
- `category` creates natural UI groupings
- the server remains easy to update without changing AIRI
- multiple engines can expose large tag lists in the same normalized format

On the AIRI side, helper UI can group tags by category:
- `emotion`
- `prosody`
- `tone`
- `effect`
- `narrative`
- `style`
- `sound`

This is especially useful for the second Acting prompt field.

---

## 6. Acting Tab: Final Shape

Location:
- `Settings -> AIRI Card -> Edit -> Acting`

The Acting tab should be built around **three prompt-helper fields**.

These are not rigid config panels. They are prompt fields with capability-aware helper UI.

### Field 1. ACT / Model Expressions

This field is AIRI-native and unrelated to TTS.

Purpose:
- teach the LLM how to use AIRI `ACT` tokens
- bridge VRM or model expression capabilities into prompt instructions

Default seeded content should be something like:

```md
## Instruction: ACT Tokens
Start every reply with an ACT token to indicate your initial mood or action. If your synchronization or focus changes, insert a new ACT token. One token lasts until you use a new one.

**ACT JSON format (all fields optional):**
`<|ACT:"emotion":{"name": expression_name, "intensity": 1},"motion":"action cue"|>`

## Available Expressions (Keys)
Use these EXACT names in your ACT tokens:
```

Helper UI:
- query the active model's available expressions, such as VRM `listExpressions`
- show expression names below the textarea
- allow click-to-insert or autocomplete

Goal:
- connect the model's real capabilities to the prompt in a normie-friendly way
- surface logic that is currently hidden in longer description/system prompt blocks

### Field 2. Speech Tags / Audio Expressions

This field is for provider-side expressive audio tags.

Purpose:
- teach the LLM how to use vocal expression tags when the active provider supports them

Examples:
- Chatterbox tags
- Grok-style tag providers
- future `fish` support if it exposes the same capability shape

Helper UI:
- look up the active voice
- resolve its provider
- if the provider supports speech tags, surface available tags below the textarea
- group those tags by category when category metadata exists
- allow click-to-insert or autocomplete

This field remains a prompt field, not provider config.

### Field 3. Speech Mannerisms

This field is for semantic speech style guidance backed by provider-side mannerism capabilities.

Purpose:
- teach the LLM when and how to use supported mannerisms
- without revealing the backend implementation details or output mapping

Helper UI:
- query `availableSpeechMannerisms`
- render one helper button per mannerism
- clicking a button inserts a curated instruction blurb into the textarea

Examples of helper labels:
- `tilde`
- `eyes`
- `hmph`

Important:
- the inserted text should explain *usage semantics*
- it should **not** explain what the mannerism maps to internally

The LLM should understand:
- when to use it
- how often to use it
- what emotional flavor it conveys

The LLM should **not** be told:
- exact regex mappings
- exact replacement side effects
- internal transformation implementation

---

## 7. What Gets Moved Out of Hidden Prompt Blocks

Today, some acting-related instructions are effectively buried in large description/personality blocks.

That content should be surfaced and cleaned up into explicit helper-backed fields.

### Example Split

A current personality markdown file may contain:
- character core / backstory
- speaking style
- TTS tag guidance
- ACT token instructions
- widget behavior
- proactivity instructions

The intended cleanup is:

- **Character core / personality**
  - stays in the core personality/system prompt fields

- **ACT token instructions**
  - move into Acting Field 1

- **speech tags / vocal expression guidance**
  - move into Acting Field 2

- **speech mannerism guidance**
  - move into Acting Field 3

- **proactivity**
  - already moved into the dedicated proactivity system

This makes the prompt architecture much easier to understand and maintain.

---

## 8. Chatterbox Management Studio

Location:
- `Settings -> Providers -> Speech -> Chatterbox`

This is already implemented and should remain focused on provider-side lifecycle management.

The studio is responsible for:
- capabilities overview
- preset CRUD
- profile CRUD
- preview/playground workflows

It is **not** the place to author AIRI character behavior prompts.

That belongs in the AIRI Card `Acting` tab.

This separation is intentional:
- Chatterbox studio manages reusable provider-side speech assets
- AIRI Acting tab manages character-specific prompt behavior

---

## 9. End-to-End Semantic Pipeline

### Step 1. Prompt Injection

AIRI injects the three Acting prompt fields into the system prompt builder:
- ACT / model expression instructions
- speech tag instructions
- speech mannerism instructions

### Step 2. LLM Generation

The LLM produces output using those rules.

Example:

```text
<|ACT:"emotion":{"name":"Surprised"}|> [gasp] You can see my true form...
```

Or, if mannerism guidance is active, it may also produce textual structures that are later transformed by provider-side preprocessing.

### Step 3. AIRI Parsing

AIRI handles AIRI-native semantics:
- parse ACT tokens
- drive VRM or model expression systems
- strip or route control tokens appropriately

This is AIRI-native and independent of Chatterbox.

### Step 4. Provider-Side Speech Processing

If the active speech provider supports expressive tags or mannerism transformations:
- provider-side preprocessing applies
- preset resolution applies
- profile transformations apply

For Chatterbox:
- preset resolves to base voice + profile + rendering settings
- `preprocess_text()` handles mannerism transformations
- TTS synthesis generates final audio

### Step 5. Audio Generation

The speech engine renders the final waveform using:
- the resolved voice
- any preset-specific settings
- the final transformed text

---

## 10. Design Rules Going Forward

1. **Do not collapse voice and preset into one concept.**
2. **Do not make Acting prompt fields strict mirrors of provider state.**
3. **Use capability-driven helper UI beneath open-ended prompt fields.**
4. **Keep AIRI-native model acting separate from provider-side speech expression systems.**
5. **Explain semantics to the LLM, not backend implementation side effects.**
6. **Keep Chatterbox studio and AIRI Acting tab as separate authoring surfaces.**
7. **For Chatterbox-compatible engines, prefer expanding `/capabilities` over inventing more narrow helper endpoints.**
8. **For large supported-tag sets, use server-side CSV as the source of truth and send normalized grouped capability data to AIRI.**

---

## 11. Immediate Next Frontier

The next major implementation step is:

### AIRI Card `Acting` Tab

This should include:
- the three prompt-helper fields
- default seeded blurbs
- model-expression helper UI
- provider speech-tag helper UI
- provider speech-mannerism helper UI

Once that exists, the Chatterbox integration becomes an end-to-end character authoring workflow instead of just a provider management surface.

### Implementation order

Before building the full Acting tab UI, lock in the data contract:

1. Expand Chatterbox `/capabilities` to expose normalized speech-helper metadata.
2. Add server-side support for loading `supported_tags.csv`.
3. Extend AIRI provider capability plumbing to consume:
   - expression tags
   - mannerisms
   - presets
4. Then build the Acting tab on top of those stable helper contracts.
