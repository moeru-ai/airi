# `@proj-airi/motion-driver-magic`

MAGIC means Markovian Animation Generator with Illusory Conditioning.
This package fits procedural motion models and generates normalized motion frames.
Its root entry point exports the VAR and AR-HMM models.

## Use the package

```ts
import type { TrainingSequence } from '@proj-airi/motion-driver-magic'

import { fit } from '@proj-airi/motion-driver-magic'

const sequence: TrainingSequence = {
  sampleRateHz: 30,
  sourceDurationMs: 1000,
  frames,
}

const model = fit(sequence, { method: 'var', order: 12, ridge: 0.001 })
const generator = model.toGenerator({ seed: 1 })
const frame = generator.next({ noiseScale: 1 })
```

## When to use it

Use this package for model fitting and seeded procedural motion generation.
The caller controls scheduling, filtering, transport, and renderer integration.

Do not import Vue, renderer objects, recording editors, or browser scheduling into this package.
Convert application recordings to fixed-width numeric frames before fitting a model.
