import { looseObject, object, parse, pipe, safeParse, string, transform } from 'valibot'
import { describe, expect, it } from 'vitest'
import { defineComponent } from 'vue'

import { defineCallingComponent, parseComponentProps } from './index'

describe('defineCallingComponent', () => {
  const component = defineCallingComponent(
    'weather',
    defineComponent({}),
    object({ city: string() }),
  )

  it('uses a loose object schema for component props', () => {
    expect(component.schema.type).toBe('loose_object')
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

  // Reproduces https://github.com/moeru-ai/airi/pull/3511#discussion_r4563517699: registered props must keep schema output.
  it('returns transformed output from a loose object schema', () => {
    const schema = looseObject({ city: pipe(string(), transform(value => value.trim())) })

    expect(parseComponentProps(schema, '{"city":" Tokyo ","extra":true}')).toEqual({ city: 'Tokyo', extra: true })
  })
})
