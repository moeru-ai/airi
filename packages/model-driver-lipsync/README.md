# `@proj-airi/model-driver-lipsync`

Shared lip-sync profiles and model-neutral mouth-driving policies for AIRI.

## What It Does

- Exposes the shared wLipSync profile.
- Converts raw AEIOUS frames into stable AEIOU weights.
- Owns winner selection, silence detection, and weight smoothing.
- Provides the existing Live2D lip-sync driver.
- Exposes the browser-only wLipSync node factory through a separate runtime entry.

The package does not write weights to VRM expressions or MMD morphs. Each renderer owns that mapping.

## Exports

- `@proj-airi/model-driver-lipsync`: the Live2D driver.
- `@proj-airi/model-driver-lipsync/shared/wlipsync`: the profile, types, and pure vowel driver.
- `@proj-airi/model-driver-lipsync/runtime/wlipsync`: the browser-only audio-node factory.

The shared entry has no Web Audio side effects. Node-based tools and tests can import it safely.

## How To Use It

```ts
import { createWLipSyncNode } from '@proj-airi/model-driver-lipsync/runtime/wlipsync'
import {
  createWLipSyncVowelDriver,
  wlipsyncProfile,
} from '@proj-airi/model-driver-lipsync/shared/wlipsync'

const node = await createWLipSyncNode(audioContext, wlipsyncProfile)
const driver = createWLipSyncVowelDriver()
const weights = driver.update(node, deltaSeconds)
```

The caller owns the `AudioContext`, the source node, and the source lifecycle.

## When To Use It

- Use the shared entry when a renderer needs standard AEIOU weights.
- Use the runtime entry when browser code creates a wLipSync audio node.
- Keep renderer-specific expression and morph mappings in the renderer package.

## When Not To Use It

- Do not import the runtime entry from Node-only code.
- Do not add Vue, Three.js, VRM, or MMD dependencies to this package.
- Do not move renderer-specific model writes into the shared driver.
