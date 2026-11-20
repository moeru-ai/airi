import { describe, expect, expectTypeOf, it } from 'vitest'

import * as v from 'valibot'

import { SatoriListSchema, SatoriMessageSchema } from './schema'

describe('satori list schema', () => {
  it('parses a paginated list of messages', () => {
    const schema = SatoriListSchema(SatoriMessageSchema)
    const input = {
      data: [{ id: 'message-1', content: 'Hello' }],
      next: 'page-2',
    }

    expect(v.parse(schema, input)).toEqual(input)
    expectTypeOf<v.InferOutput<typeof schema>>().toEqualTypeOf<{
      data: v.InferOutput<typeof SatoriMessageSchema>[]
      next?: string
    }>()
  })

  it('accepts an empty list without a pagination cursor', () => {
    const schema = SatoriListSchema(v.string())

    expect(v.parse(schema, { data: [] })).toEqual({ data: [] })
  })

  it('preserves different item input and output types', () => {
    const schema = SatoriListSchema(v.pipe(v.string(), v.transform(value => value.length)))

    expectTypeOf<v.InferInput<typeof schema>>().toEqualTypeOf<{
      data: string[]
      next?: string
    }>()
    expectTypeOf<v.InferOutput<typeof schema>>().toEqualTypeOf<{
      data: number[]
      next?: string
    }>()
    expect(v.parse(schema, { data: ['Hello', 'Hi'] })).toEqual({ data: [5, 2] })
  })

  it.each([
    { data: [{ content: 'Missing message ID' }] },
    { data: [{ id: 1 }] },
    { data: 'not a list' },
    { data: [], next: 1 },
    {},
  ])('rejects an invalid list response: %j', (input) => {
    const schema = SatoriListSchema(SatoriMessageSchema)

    expect(v.safeParse(schema, input).success).toBe(false)
  })

  it('accepts only synchronous item schemas', () => {
    expectTypeOf<v.GenericSchemaAsync>().not.toExtend<Parameters<typeof SatoriListSchema>[0]>()
  })
})
