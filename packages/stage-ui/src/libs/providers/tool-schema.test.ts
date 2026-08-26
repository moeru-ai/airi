import type { JsonSchema } from 'xsschema'

import { describe, expect, it } from 'vitest'

import { collapseToolSchemaPrimitiveAnyOf } from './tool-schema'

describe('collapseToolSchemaPrimitiveAnyOf', () => {
  it('collapses nested heterogeneous primitive unions without changing the input', () => {
    const schema: JsonSchema = {
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
      type: 'object',
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
          properties: {
            value: { type: 'string' },
          },
          type: 'object',
        },
        {
          items: { type: 'string' },
          type: 'array',
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
          maximum: 10,
          minimum: 1,
          type: 'integer',
        },
        { type: 'null' },
      ],
    })

    expect(normalized).toEqual({
      maximum: 10,
      minimum: 1,
      type: ['integer', 'null'],
    })
  })
})
