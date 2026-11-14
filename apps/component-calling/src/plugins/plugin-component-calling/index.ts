import type { GenericSchema, InferOutput } from 'valibot'
import type { Component } from 'vue'

import { intersect, record, safeParse, string, unknown } from 'valibot'
import { markRaw } from 'vue'
import { toJsonSchema } from 'xsschema'

/** Creates a component definition with a runtime validator and JSON Schema. */
export function defineCallingComponent<T extends GenericSchema>(name: string, component: Component, schema: T, exampleProps?: InferOutput<T>) {
  const componentSchema = intersect([schema, record(string(), unknown())])

  return {
    name,
    schema: componentSchema,
    jsonSchema: toJsonSchema(schema),
    component: markRaw(component),
    exampleProps,
  }
}

/** Parses JSON component props and returns their validated schema output. */
export function parseComponentProps<T extends GenericSchema<unknown, Record<string, unknown>>>(schema: T, value: string): InferOutput<T> {
  const props: unknown = JSON.parse(value.trim())
  const result = safeParse(schema, props)

  if (!result.success) {
    throw new TypeError(result.issues.map(issue => issue.message).join(', '))
  }

  return result.output
}
