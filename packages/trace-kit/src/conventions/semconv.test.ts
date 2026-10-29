import { describe, expect, it } from 'vitest'

import * as incubating from '@opentelemetry/semantic-conventions/incubating'

import * as semconv from './semconv'

/** Copies that the npm package does not export yet. Each one has a `NOTICE` in `./semconv`. */
const NOT_RELEASED = new Set(['ATTR_GEN_AI_MEMORY_QUERY_TEXT'])

const copies = Object.entries(semconv).filter(([name]) => name !== 'SEMCONV_VERSION' && !NOT_RELEASED.has(name))

describe('semconv copies', () => {
  it.each(copies)('%s equals the export of @opentelemetry/semantic-conventions/incubating', (name, value) => {
    expect(incubating).toHaveProperty(name, value)
  })

  it.each([...NOT_RELEASED])('%s is not in the npm package yet', (name) => {
    // When this fails, the package has the attribute. Remove it from NOT_RELEASED and remove its NOTICE.
    expect(incubating).not.toHaveProperty(name)
  })
})
