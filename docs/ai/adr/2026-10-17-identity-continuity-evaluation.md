# Identity-continuity evaluation package

Status: proposed

## Context

AIRI characters run across long sessions with retention, automatic
summarisation, and hybrid retrieval. These strategies compress context to fit a
window. Factual recall has checks, but there is no automated measure of whether
the character still holds the same identity after compression. A persona can
lose its self-description, contradict its values, change its style, or split
between two conflicting stances, and today this is found only by manual chat.

A library is needed that can run in tests and compare memory strategies with
numbers, without binding to one model provider.

## Decision

Add a new self-contained package `@proj-airi/memory-eval` under
`packages/memory-eval`. It adds no runtime dependency and changes no existing
package.

It models identity with four primitives:

- A **fixed-point probe** treats the character self-description as an operator
  `T(s)`; a stable identity converges to a fixed point.
- A **4D rubric** scores every probe answer on identity, value, expression, and
  memory. The weighted center of these scores is the narrative barycenter.
- **Wasserstein-1 distance** measures barycenter migration between a baseline
  and the current state.
- A **GMM BIC comparison** (one component versus two) detects a split into two
  personas.
- **Cohen kappa** against human labels validates that the rubric tracks human
  judgement.

The caller supplies two functions: `infer`, which produces a character answer,
and `judge`, which scores an answer on the four axes. `createJudge` adapts any
chat callback, and `createMockJudge` gives deterministic offline scores. This
keeps the package provider-agnostic.

The package includes a Vitest suite. A package-local `vitest.config.ts` keeps
the suite independent of the root Vitest project list, so adding the package
needs no change to the root configuration.

## Consequences

- Memory strategies can be compared with numbers and guarded by a regression
  test, instead of by manual chat.
- W1 migration and a two-persona split are distinct signals. Uniform
  compression moves the single barycenter and is caught by W1; it does not
  create a second peak, so BIC stays negative. A true oscillating persona is
  caught by BIC.
- Thresholds are inputs. The shipped defaults (W1 0.3, fixed-point 0.15, BIC
  gain 10, kappa 0.4) come from a small offline study and must be calibrated
  per persona, not treated as universal constants.
- The mock judge and the deterministic adapters support offline runs. A
  real-LLM evaluation over live AIRI sessions is future work.
