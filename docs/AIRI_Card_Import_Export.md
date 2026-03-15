# AIRI Card Import / Export Design

## Goal

AIRI cards should be portable.

Users need a durable copy of their cards that can be:
- backed up
- versioned in git
- shared with other AIRI users
- eventually shared with broader character-card ecosystems

The current AIRI card editor is too valuable to leave trapped in local storage.

---

## Product Direction

The feature should be built in phases.

### Phase 1: JSON Import / Export

This is the minimum viable durable format.

Goals:
- export any AIRI card as JSON
- import that JSON back into AIRI
- preserve AIRI-specific extensions cleanly
- make the file easy to diff and maintain manually

Why JSON first:
- lowest implementation risk
- easiest to debug
- easiest to version control
- no image/metadata encoding work required

### Phase 2: PNG Character Card Import / Export

This is the shareable character-card format.

Goals:
- export an AIRI card as a PNG
- use the card preview image as the exported PNG image
- embed card JSON in the PNG metadata
- import compatible PNG cards back into AIRI

Why PNG second:
- much better for sharing
- familiar to SillyTavern and similar ecosystems
- lets users treat a card as both image and data

---

## Core Requirement

The AIRI card format must be both:
- AIRI-native
- mappable to common card schemas

That means AIRI should preserve its own richer extension model without being forced into a lowest-common-denominator format.

So the design should distinguish between:
- **AIRI-native full fidelity export**
- **cross-ecosystem compatibility export**

---

## AIRI-Native JSON Format

Phase 1 should export the full AIRI card object in JSON.

That includes:
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

### Principle

Do not throw away AIRI-specific information just to imitate external formats.

The JSON export should be the canonical backup format.

### Likely Shape

```json
{
  "format": "airi-card",
  "version": 1,
  "card": {
    "...": "full AIRI card payload"
  }
}
```

This wrapper gives room for:
- future schema evolution
- migration/versioning
- import validation

---

## PNG Import / Export Direction

Phase 2 should support image-based cards similar to SillyTavern character cards.

The high-level idea:
- choose the card preview image as the PNG
- embed card JSON into PNG metadata
- export one portable image file
- allow users to import that image back into AIRI

This is especially attractive because the AIRI card system already has:
- display model preview images
- rich card metadata

So a PNG export becomes a natural “share card” artifact.

---

## Compatibility With Existing Character Card Ecosystems

SillyTavern-style cards typically expose a simpler schema with fields like:
- `name`
- `description`
- `first_mes`

and related character-card content.

That means compatibility should be treated as a mapping layer, not the source of truth.

### Mapping Direction

Common portable fields can map from AIRI like:
- `name` <- card name
- `description` <- AIRI description / core descriptive text
- `first_mes` <- first greeting
- `personality` <- AIRI personality
- `scenario` <- AIRI scenario
- `mes_example` <- AIRI example messages if present
- `system_prompt` <- AIRI system prompt when target format supports it

### Important Rule

Do not assume external card formats can represent:
- AIRI modules
- acting helper prompts
- Chatterbox-specific speech setup
- artistry
- proactivity

Those richer fields should remain in AIRI-native payloads.

For PNG export, there are two viable strategies:

1. **AIRI-in-PNG**
- embed AIRI-native full JSON
- best for AIRI-to-AIRI portability

2. **Compatibility PNG**
- embed a mapped common character-card payload
- best for outside-tool compatibility

The likely best long-term answer is to support both:
- `Export as AIRI PNG`
- `Export as Compatibility PNG`

But Phase 2 can start with AIRI-native PNG first if that is simpler.

---

## Import Behavior

Import should be explicit about what kind of card is being loaded.

### JSON Import

Should accept:
- AIRI-native JSON card export

Later, optionally:
- mapped compatibility JSON if desired

### PNG Import

Should detect:
- AIRI-native embedded payload
- compatibility payload if supported later

If the imported payload is compatibility-only, AIRI should:
- fill the basic character fields
- leave AIRI-specific sections blank/defaulted
- let the user enhance the card afterward

---

## UI Direction

This should eventually exist in two places:

### 1. AIRI Card Settings Page

Actions per card:
- Export JSON
- Export PNG
- Duplicate
- Import card

This is the natural home for card lifecycle management.

### 2. Maybe System / Data Management

Optional later:
- bulk export
- bulk import
- migration tools

But phase 1 should stay focused on per-card import/export.

---

## Preview Image Behavior

For PNG export, the exported image should use the card preview image when available.

That is the best UX because:
- the card looks shareable
- the image visually represents the character
- no extra asset-picking step is needed in the common path

Fallbacks, if no preview exists:
- use a default AIRI card template image
- or prompt the user to choose an image later

---

## Phase 1 Scope

Phase 1 should include:
- export a selected AIRI card as JSON
- import AIRI JSON into the card library
- schema/version wrapper
- validation and safe error messages
- preserve full AIRI extension fidelity

Phase 1 should not require:
- PNG metadata support
- compatibility mappings
- image pipeline changes

---

## Phase 2 Scope

Phase 2 should include:
- export card as PNG with embedded metadata
- import PNG cards
- use card preview image for export

Phase 2 open question:
- embed AIRI-native payload only
- or support a compatibility export mode too

---

## Future Visual Export Polish

This is explicitly not part of phase 1.

Once PNG export exists, AIRI can polish the shareable artifact further because AIRI controls:
- the preview render
- the export image dimensions
- the final composition pipeline

### Direction

Support a more card-like visual export style instead of only dumping the raw preview image.

Possible later export modes:
- `Raw Preview PNG`
- `Styled Card PNG`

### Styled Card PNG Ideas

- decorative frame or border treatment
- AIRI branding mark in a corner
- tuned composition for portrait-style sharing
- title/name plate
- optional subtle metadata overlay

This would make exported cards feel:
- more intentional
- more collectible
- more obviously AIRI-native

### Important Rule

Do not block the initial PNG metadata export on this polish work.

The correct order is:
1. make PNG import/export functionally correct
2. then refine the presentation and branding

---

## Open Design Questions

1. Should AIRI JSON export be a wrapped schema or just the raw card object?
   Current recommendation: wrapped schema with `format` and `version`.

2. Should PNG export embed full AIRI-native JSON, compatibility JSON, or both?
   Current recommendation: AIRI-native first, compatibility mode later.

3. Should import create a new card always, or allow overwrite/update?
   Current recommendation: create new by default, with duplicate-name handling.

4. Should preview images be exported separately in JSON mode?
   Current recommendation: no for phase 1. Keep JSON textual and durable first.

5. Should compatibility import/export be part of the same UI action set or a separate advanced menu?
   Current recommendation: separate explicit actions to avoid confusion.

---

## Recommended Next Step

Build **Phase 1 JSON import/export** first.

That gives:
- durable backups
- easy manual editing
- no ambiguity about schema
- a stable card portability foundation

After that, PNG import/export can build on the same serialized payload.
