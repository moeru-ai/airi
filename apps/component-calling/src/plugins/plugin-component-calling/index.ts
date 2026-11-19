import type { ErrorMessage, InferOutput, ObjectEntries, ObjectIssue, ObjectSchema } from 'valibot'
import type { Component } from 'vue'

import { record, safeParse, string, unknown } from 'valibot'
import { markRaw } from 'vue'
import { toJsonSchema } from 'xsschema'

/** Creates a component definition with a runtime validator and JSON Schema. */
export function defineCallingComponent<T extends ObjectSchema<ObjectEntries, ErrorMessage<ObjectIssue> | undefined>>(name: string, component: Component, schema: T, exampleProps?: InferOutput<T>) {
  return {
    name,
    schema,
    jsonSchema: toJsonSchema(schema),
    component: markRaw(component),
    exampleProps,
  }
}

/** Parses JSON component props and returns their validated schema output. */
export function parseComponentProps<T extends ObjectSchema<ObjectEntries, ErrorMessage<ObjectIssue> | undefined>>(schema: T, value: string): InferOutput<T> {
  const props: unknown = JSON.parse(value.trim())
  const recordResult = safeParse(record(string(), unknown()), props)

  if (!recordResult.success) {
    throw new TypeError(recordResult.issues.map(issue => issue.message).join(', '))
  }

  const result = safeParse(schema, props)

  if (!result.success) {
    throw new TypeError(result.issues.map(issue => issue.message).join(', '))
  }

  const additionalProps = Object.fromEntries(
    Object.entries(recordResult.output).filter(([key]) => !Object.hasOwn(schema.entries, key)),
  )

  return { ...additionalProps, ...result.output }
}
