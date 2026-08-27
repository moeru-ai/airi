# `@proj-airi/model-live2d-motion`

This package fits procedural motion models and generates normalized Live2D poses.
The package has separate entry points for VAR and AR-HMM models.

## Use the package

Load only the selected model entry point.

```ts
import type { Live2DMotionTrainingSequence } from '@proj-airi/model-live2d-motion'

const sequence: Live2DMotionTrainingSequence = {
  sampleRateHz: 30,
  sourceDurationMs: 1000,
  poses,
}

const { createVarMotionPredictor, fitVarMotionModel }
  = await import('@proj-airi/model-live2d-motion/var')

const model = fitVarMotionModel(sequence, { order: 12, ridge: 0.001 })
const predictor = createVarMotionPredictor(model, { seed: 1 })
const frame = predictor.next({ noiseScale: 1 })
```

## When to use it

Use this package for model fitting and seeded procedural pose generation.
The caller controls scheduling, filtering, transport, and renderer integration.

Do not import Vue, Live2D SDK objects, recording editors, or browser scheduling into this package.
Convert application recordings to a fixed-rate training sequence before fitting a model.
