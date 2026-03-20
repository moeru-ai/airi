# ACT Expression System

The AIRI ACT system lets the AI character express emotions in real-time via special tokens embedded in dialogue. This document explains the full pipeline from AI output to VRM animation.

## Token Format

```
<|ACT:"emotion":{"name":"heart","intensity":1},"motion":"action cue"|>
<|DELAY:1|>
```

The parser is resilient: it attempts strict JSON, then wraps bare key-value pairs in `{}`, then falls back to regex extraction.

## Pipeline

```
AI Response text
    ↓
Stage.vue  processMarkers()          ← regex: /<\|(?:ACT|DELAY)[\s\S]*?\|>/gi
    ↓
queues.ts  parseActEmotion()         ← extracts { name, intensity } from payload
    ↓
emotionsQueue.enqueue({ name, intensity })
    ↓
VRMModel.vue  (queue consumer)       ← setEmotionWithResetAfter() or setEmotion()
    ↓
expression.ts  setEmotion(name, intensity)
    ↓
VRM expressionManager.setValue()    ← drives morph targets + material color binds
```

## Emotion Name Resolution (expression.ts)

`setEmotion()` resolves names in two stages:

### Stage 1: emotionStates map (hardcoded presets)
A static `Map<string, EmotionState>` in `expression.ts` maps generic names to VRM expression sequences:

| Key | Maps to |
|-----|---------|
| `happy` | `happy` (0.7) + `aa` (0.2) |
| `sad` | `sad` (0.7) + `oh` (0.15) |
| `angry` | `angry` (0.7) + `ee` (0.3) |
| `surprised` | `surprised` (0.8) + `oh` (0.4) |
| `neutral` | `neutral` (1.0) |
| `think` | `think` (0.7) |
| `cool` | `Pixel glasses` (1.0) |

### Stage 2: Raw VRM fallback
If the name is NOT in the static map, `setEmotion()` does a **case-insensitive search** in `vrm.expressionManager.expressionMap` and creates a dynamic entry. This is how all of Satoimo's custom expressions (`heart`, `star_eyes`, `x_eyes`, `gloomy`, etc.) work.

### Transition System
When any emotion is set, ALL other expression weights are lerped to 0 over `blendDuration` seconds. The target emotion fades IN simultaneously. This means overlay expressions (like `heart`) will be cleared when the next `setEmotion()` is called.

## EMOTION_VALUES (queues.ts)
`normalizeEmotionName()` in `queues.ts` checks if the name is in `EMOTION_VALUES` (the `Emotion` enum from `constants/emotions.ts`). Currently only includes: `happy`, `sad`, `angry`, `think`, `surprised`, `awkward`, `question`, `curious`, `neutral`, `cool`.

**Names NOT in EMOTION_VALUES pass through as raw strings** — this is intentional and allows model-specific expressions to work.

## EMOTION_VRMExpressionName_value
A secondary mapping (`constants/emotions.ts`) translates generic `Emotion` enum values to VRM expression names. Currently has limited mappings (e.g., `awkward` → `neutral`, `question` → `think`).

## Debug Tools (available at window in dev mode)

```js
// List all VRM expressions loaded for current model
listExpressions()

// Trigger emotion via full ACT pipeline (3s auto-reset)
testEmotion('heart')

// Set VRM expression directly (3s reset)
setRawExpression('heart', 1)

// Set VRM expression permanently (no reset)
setPersistentExpression('heart', 1)

// Reset all expressions to 0
resetVrm()

// Nuclear reset: forces all morph target influences to 0
nuclearReset()
```

## Satoimo Chibi Expression Registry

Satoimo has **94 expressions** split between VRM0 presets (capitalized) and custom expressions (lowercase).

### Preset (maps via case-insensitive fallback)
`Neutral`, `A/I/U/E/O` (lip sync), `Blink`, `Blink_L/R`, `Angry`, `Fun`, `Joy`, `Sorrow`, `Surprised`

### Custom (direct name match)
`heart`, `star_eyes`, `x_eyes`, `small_x_eyes`, `shocked_eyes`, `arrow_eyes`, `crying`, `heartbroken`, `scared`, `exclamation`, `speechless`, `sweating`, `anger`, `sleepy`, `question`, `gloomy`, `music`, `cat_mouth`

### Accessory toggles (material-based, intensity 0 or 1)
`glasses`, `pixel_glasses`, `pixel_glasses_up`, `pixel_glasses_down`, `uniform`, `nightgown`

## Known Issues

1. **Satoimo presets use capitalized names** — `Joy`, `Fun`, `Sorrow` won't match the static emotionStates map (which looks for `happy`, `sad`) but DO resolve via the case-insensitive raw fallback. The AI personality uses `joy`, `fun`, `sorrow` which maps correctly.

2. **emotionStates map is model-agnostic** — if a new model uses different preset names, the static map misses them until the raw fallback takes over.

3. **No persistent overlay support** — calling `setEmotion('neutral')` after `setEmotion('heart')` zeroes out the heart overlay, because all expressions are reset on each transition.
