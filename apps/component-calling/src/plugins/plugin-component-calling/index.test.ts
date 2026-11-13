import { object, parse, pipe, safeParse, string, transform } from 'valibot'
import { describe, expect, it } from 'vitest'
import { defineComponent } from 'vue'

import { defineCallingComponent, parseComponentProps } from './index'

describe('defineCallingComponent', () => {
  const component = defineCallingComponent(
    'weather',
    defineComponent({}),
    object({ city: string() }),
  )

  it('combines the component schema with record validation', () => {
    expect(safeParse(component.schema, { city: 'Tokyo' }).success).toBe(true)
  })

  it('preserves valid additional props', () => {
    expect(parse(component.schema, { city: 'Tokyo', extra: true })).toEqual({ city: 'Tokyo', extra: true })
  })

  it('rejects invalid component props and non-record values', () => {
    expect(safeParse(component.schema, { city: 25 }).success).toBe(false)
    expect(safeParse(component.schema, ['Tokyo']).success).toBe(false)
    expect(safeParse(component.schema, 'Tokyo').success).toBe(false)
  })

  it('keeps JSON schema generation based on the original schema', async () => {
    await expect(component.jsonSchema).resolves.toMatchObject({
      properties: { city: { type: 'string' } },
      type: 'object',
    })
  })

  it('parses and validates serialized component props', () => {
    expect(parseComponentProps(component.schema, '{"city":"Tokyo","extra":true}')).toEqual({ city: 'Tokyo', extra: true })
    expect(() => parseComponentProps(component.schema, '{"city":25}')).toThrow(TypeError)
    expect(() => parseComponentProps(component.schema, 'not JSON')).toThrow(SyntaxError)
  })

  it('returns transformed schema output', () => {
    const schema = object({ city: pipe(string(), transform(value => value.trim())) })

    expect(parseComponentProps(schema, '{"city":" Tokyo "}')).toEqual({ city: 'Tokyo' })
  })
})
