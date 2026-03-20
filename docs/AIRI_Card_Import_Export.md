# AIRI Card Import / Export Design

## Goal

AIRI cards should be portable.

Users need a durable copy of their cards that can be:
- backed up
- versioned in git
- shared with other AIRI users
- imported from broader character-card ecosystems

The current AIRI card editor is too valuable to leave trapped in local storage.

---

## Product Direction

The feature is intentionally split into two layers:

### 1. AIRI JSON

This is the full-fidelity house format.

Use it for:
- backup
- restore
- version control
- preserving AIRI-specific extensions without loss

### 2. Compatibility PNG

This is the shareable ecosystem format.

Use it for:
- importing existing community cards
- exporting AIRI cards into the broader card ecosystem
- cross-tool sharing

The compatibility target is currently:
- SillyTavern-style `chara_card_v2` PNG cards

---

## AIRI-Native JSON Format

The AIRI JSON export is the canonical backup/export format.

It preserves:
- base card fields
- greetings
- system prompt
- post-history instructions
- AIRI extensions
  - modules
  - artistry
  - acting
  - heartbeats / proactivity config
  - future AIRI-specific fields

### Current JSON Wrapper

```json
{
  "format": "airi-card",
  "version": 1,
  "card": {
    "...": "full AIRI card payload"
  }
}
```

Why this wrapper exists:
- schema evolution
- migration/versioning
- import validation

### Current JSON Import Behavior

When AIRI imports JSON:
- if it sees the AIRI wrapper, it loads `card`
- otherwise it still accepts the older raw-card JSON path
- duplicate names are auto-renamed on import

Example:
- `Lain`
- `Lain (2)`
- `Lain (3)`

---

## Compatibility PNG Direction

PNG export/import is the compatibility layer, not the AIRI source of truth.

The current implementation uses:
- the cached model `previewImage`
- a `chara_card_v2` payload
- PNG text metadata

This keeps the implementation simple while maximizing compatibility.

### Why This Is The Right MVP

- no new render pipeline required
- immediate interoperability with existing card communities
- AIRI JSON remains the durable house format

---

## Current PNG Compatibility Contract

The current compatibility target is:
- PNG metadata key: `chara`
- metadata chunk type: `tEXt`
- metadata value: base64-encoded UTF-8 JSON
- JSON payload type: `chara_card_v2`

### Example Top-Level Payload

```json
{
  "spec": "chara_card_v2",
  "spec_version": "2.0",
  "data": {
    "name": "Character Name",
    "description": "Character description",
    "personality": "",
    "scenario": "",
    "first_mes": "First greeting",
    "mes_example": "",
    "creator_notes": "",
    "system_prompt": "",
    "post_history_instructions": "",
    "alternate_greetings": [],
    "tags": [],
    "creator": "",
    "character_version": "",
    "extensions": {}
  }
}
```

---

## AIRI Field Mapping To `chara_card_v2`

Current AIRI PNG export maps:
- `name` <- card name
- `description` <- card description
- `personality` <- card personality
- `scenario` <- card scenario
- `first_mes` <- first greeting
- `alternate_greetings` <- remaining greetings
- `mes_example` <- flattened example messages
- `creator_notes` <- card notes
- `system_prompt` <- AIRI system prompt
- `post_history_instructions` <- AIRI post-history instructions
- `character_version` <- AIRI card version
- `tags` <- AIRI tags
- `creator` <- AIRI creator
- `extensions` <- AIRI extensions object as-is

Important:
- AIRI-specific fields are preserved only opportunistically in `extensions`
- true full fidelity still belongs to AIRI JSON

---

## Current PNG Import Behavior

When AIRI imports PNG:
- it reads PNG `tEXt` metadata chunks
- looks for the `chara` key
- base64-decodes the payload
- parses the embedded JSON
- imports the compatibility card into AIRI as a new card
- auto-renames duplicates on import

If the payload is compatibility-only, AIRI should:
- fill the standard character fields
- keep AIRI-specific fields defaulted if they are missing
- let the user enhance the card afterward

---

## UI Direction

Current direction:

### AIRI Cards Page

- one global import surface
- per-card export action

This is the current intended split:
- `Import` is page-level because it creates a new card
- `Export` is per-card because it targets one specific card

### Current UI Behavior

- Import tile supports:
  - AIRI JSON
  - `chara_card_v2` / SillyTavern-style PNG
- Export menu supports:
  - JSON
  - PNG

### Later UI Possibilities

- bulk export/import under `Settings -> Data`
- export-all AIRI cards
- backup bundles

But those are later-phase lifecycle features, not current scope.

---

## Preview Image Behavior

Current PNG export uses the card's selected display model cached `previewImage`.

That is still the correct MVP because:
- the selector/model library already generates good previews
- the image is already cached
- no extra model render path is needed

### Current Framed Composition

The current shareable PNG export composes three layers:

1. cached model `previewImage`
2. rectangular clip to the portrait window
3. exported frame overlay

Current frame asset:
- `packages/stage-pages/src/pages/settings/airi-card/card-export-frame.png`

Current frame canvas:
- `925 x 1436`

Current inner portrait box:
- `x = 65`
- `y = 79`
- `width = 831`
- `height = 1295`

Current preview placement rule:
- fit preview to the inner-box width
- align to the top edge of the inner box
- crop any bottom overflow

This keeps the first framed export deterministic and simple.

### Important Note

This is good enough for now, but not the final quality target.

The cached preview does not necessarily reflect:
- customized outfit state
- active expressions
- the card's intended personality framing

That is a later renderer/composition problem, not a blocker for current compatibility export.

---

## Future Visual Export Polish

Once PNG export exists, AIRI can polish the shareable artifact further because AIRI controls:
- the preview render
- the export image dimensions
- the final composition pipeline

Possible later export modes:
- `Raw Preview PNG`
- `Styled Card PNG`

### Styled Card PNG Ideas

- decorative frame or border treatment
- AIRI branding mark in a corner
- tuned composition for portrait-style sharing
- title/name plate
- optional subtle metadata overlay

### Future Render Quality Direction

Longer-term, AIRI may want a dedicated export render path that can reflect more of the card's actual presentation state, such as:
- active outfit / customized model variant
- configured expressions
- more character-specific framing
- export-specific composition tuned for sharing

The correct order is:
1. make import/export functionally correct
2. then refine presentation and branding

---

## Open Design Questions

1. Should AIRI later support an AIRI-native PNG mode?
   Current recommendation: probably unnecessary unless compatibility limits become painful.

2. Can `chara_card_v2` safely carry richer arbitrary AIRI fields without breaking external parsers?
   Current recommendation: investigate later, do not assume.

3. Should import always create a new card, or support overwrite/update?
   Current recommendation: create new by default.

4. Should preview images be exported separately in JSON mode?
   Current recommendation: no. Keep JSON textual and durable first.

5. Should compatibility import/export stay in the same UI action set or move into an advanced menu later?
   Current recommendation: current simple menu is fine.

---

## Recommended Near-Term Next Steps

1. Keep AIRI JSON as the canonical backup format.
2. Keep compatibility PNG focused on strict `chara_card_v2` interoperability.
3. Improve import UI copy so users know AIRI supports:
   - AIRI JSON
   - `chara_card_v2` / SillyTavern-compatible PNG
4. Later, improve the PNG render/composition quality without changing the compatibility contract.
