import { maxEntries, object, pipe, safeParse, string, transform } from 'valibot'
import { describe, expect, it } from 'vitest'
import { defineComponent } from 'vue'

import { defineCallingComponent, parseComponentProps } from './index'

describe('defineCallingComponent', () => {
  const schema = object({ city: string() })
  const component = defineCallingComponent(
    'weather',
    defineComponent({}),
    schema,
  )

  it('keeps the supplied object schema', () => {
    expect(component.schema).toBe(schema)
    expect(safeParse(component.schema, { city: 'Tokyo' }).success).toBe(true)
  })

  // Reproduces https://github.com/moeru-ai/airi/pull/3511#discussion_r4582618285: registration must retain object-level pipeline actions.
  it('keeps object-level schema actions', () => {
    const schema = pipe(object({ city: string(), condition: string() }), maxEntries(1))
    const pipedComponent = defineCallingComponent(
      'weather',
      defineComponent({}),
      schema,
    )

    expect(pipedComponent.schema).toBe(schema)
    expect(() => parseComponentProps(pipedComponent.schema, '{"city":"Tokyo","condition":"Sunny"}')).toThrow(TypeError)
  })

  it('preserves valid additional props', () => {
    expect(parseComponentProps(component.schema, '{"city":"Tokyo","extra":true}')).toEqual({ city: 'Tokyo', extra: true })
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
  it('returns transformed schema output and preserves additional props', () => {
    const schema = object({ city: pipe(string(), transform(value => value.trim())) })

    expect(parseComponentProps(schema, '{"city":" Tokyo ","extra":true}')).toEqual({ city: 'Tokyo', extra: true })
  })
})
