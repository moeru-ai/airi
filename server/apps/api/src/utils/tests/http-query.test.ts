import { parse } from 'valibot'
import { describe, expect, it } from 'vitest'

import { createQueryIntegerSchema, LimitOffsetPaginationQuerySchema } from '../http-query'

describe('http query utils', () => {
  it('uses the declared default when the query value is missing', () => {
    const schema = createQueryIntegerSchema({
      defaultValue: 20,
      minimum: 1,
      maximum: 100,
    })

    expect(parse(schema, undefined)).toBe(20)
  })

  it('falls back to the declared default when the query value is invalid', () => {
    const schema = createQueryIntegerSchema({
      defaultValue: 20,
      minimum: 1,
      maximum: 100,
    })

    expect(parse(schema, 'NaN')).toBe(20)
    expect(parse(schema, '')).toBe(20)
  })

  it('falls back when the query value is only a parseInt prefix', () => {
    const schema = createQueryIntegerSchema({
      defaultValue: 20,
      minimum: 1,
      maximum: 100,
    })

    // Number.parseInt would accept these as 12, 12, and 1 respectively.
    expect(parse(schema, '12abc')).toBe(20)
    expect(parse(schema, '12.9')).toBe(20)
    expect(parse(schema, '1e2')).toBe(20)
  })

  it('accepts exact signed decimal integers', () => {
    const schema = createQueryIntegerSchema({
      defaultValue: 20,
      minimum: 1,
      maximum: 100,
    })

    expect(parse(schema, '42')).toBe(42)
    expect(parse(schema, '+7')).toBe(7)
    expect(parse(schema, ' 15 ')).toBe(15)
  })

  it('clamps values to the declared bounds', () => {
    const schema = createQueryIntegerSchema({
      defaultValue: 20,
      minimum: 1,
      maximum: 100,
    })

    expect(parse(schema, '-12')).toBe(1)
    expect(parse(schema, '999')).toBe(100)
  })

  it('parses limit/offset pagination queries with defaults and clamping', () => {
    expect(parse(LimitOffsetPaginationQuerySchema, {
      limit: undefined,
      offset: undefined,
    })).toEqual({
      limit: 20,
      offset: 0,
    })

    expect(parse(LimitOffsetPaginationQuerySchema, {
      limit: '999',
      offset: '-5',
    })).toEqual({
      limit: 100,
      offset: 0,
    })
  })
})
