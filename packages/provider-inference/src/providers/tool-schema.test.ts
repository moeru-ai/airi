import type { JsonSchema } from 'xsschema'

import { describe, expect, it } from 'vitest'

import { collapseToolSchemaPrimitiveAnyOf } from './tool-schema'

describe('collapseToolSchemaPrimitiveAnyOf', () => {
  it('collapses nested heterogeneous primitive unions without changing the input', () => {
    const schema: JsonSchema = {
      type: 'object',
      properties: {
        value: {
          anyOf: [
            { type: 'string' },
            { type: 'number' },
            { type: 'boolean' },
            { type: 'null' },
          ],
        },
      },
    }

    const normalized = collapseToolSchemaPrimitiveAnyOf(schema)

    expect(normalized.properties?.value).toEqual({
      type: ['string', 'number', 'boolean', 'null'],
    })
    expect(schema.properties?.value).toEqual({
      anyOf: [
        { type: 'string' },
        { type: 'number' },
        { type: 'boolean' },
        { type: 'null' },
      ],
    })
  })

  it('keeps object and array unions as anyOf', () => {
    const normalized = collapseToolSchemaPrimitiveAnyOf({
      anyOf: [
        {
          type: 'object',
          properties: {
            value: { type: 'string' },
          },
        },
        {
          type: 'array',
          items: { type: 'string' },
        },
        { type: 'null' },
      ],
    })

    expect(normalized.type).toBeUndefined()
    expect(normalized.anyOf).toHaveLength(3)
  })

  it('keeps numeric constraints when it collapses a nullable number', () => {
    const normalized = collapseToolSchemaPrimitiveAnyOf({
      anyOf: [
        {
          type: 'integer',
          minimum: 1,
          maximum: 10,
        },
        { type: 'null' },
      ],
    })

    expect(normalized).toEqual({
      type: ['integer', 'null'],
      minimum: 1,
      maximum: 10,
    })
  })
})
